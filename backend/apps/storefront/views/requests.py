"""
"Buy for me" and "Deliver for me" requests: the old AGIZA app's sourcing flow on
top of Intake & Quotes. The customer describes the item, staff quote it in the
admin, the customer accepts or declines in the app, and staff approve the accepted
quote into an international order, which the customer then tracks and pays.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.chat import services as chat
from apps.chat.models import Conversation, Message
from apps.core.audit import record_audit
from apps.core.pagination import StandardPagination
from apps.core.workflow import run
from apps.locations.models import Country
from apps.quotes import services as quotes
from apps.quotes.models import QuoteRequest, QuoteStatusHistory, ServiceType
from apps.tasks import services as tasks

from ..serializers import ChatSendSerializer, QuoteCreateSerializer, QuoteRequestSerializer, ReplySerializer
from .base import CustomerAPIView

REQUEST_MARKER = {"buy_for_me": "[Buy for me]", "deliver_for_me": "[Deliver for me]"}


def _description(data: dict) -> str:
    lines = [f"{REQUEST_MARKER[data['request_type']]} {data['item_name'].strip()}", f"Quantity: {data['quantity']}"]
    if data.get("link"):
        lines.append(f"Link: {data['link']}")
    if data.get("weight_kg"):
        lines.append(f"Approx. weight: {data['weight_kg']} kg")
    if data.get("tracking_number"):
        lines.append(f"Supplier tracking number: {data['tracking_number'].strip()}")
    if data.get("details", "").strip():
        lines.append(data["details"].strip())
    lines.append("Submitted in the AGIZA app")
    return "\n".join(lines)


@extend_schema(tags=["app: requests"], request=QuoteCreateSerializer, responses=QuoteRequestSerializer)
class QuoteListView(CustomerAPIView):
    def get(self, request):
        qs = QuoteRequest.objects.filter(customer=self.customer).select_related("created_order")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(QuoteRequestSerializer(page, many=True).data)

    @transaction.atomic
    def post(self, request):
        s = QuoteCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        country = Country.objects.filter(iso2=data["origin_country"].upper(), is_active=True).first()
        if country is None:
            raise ValidationError({"origin_country": ["Choose a country AGIZA ships from."]})
        quote = QuoteRequest.objects.create(
            customer=self.customer, service_type=ServiceType.INTERNATIONAL, description=_description(data),
            origin=country.name, destination=data["destination_city"].name,
        )
        # Same steps as a quotation staff enter in Intake & Quotes: history, audit, follow-up task.
        QuoteStatusHistory.objects.create(quote=quote, to_status=quote.status, note="Requested in the AGIZA app")
        record_audit(action="create", request=request, instance=quote,
                     changes={"customer": [None, quote.customer_id], "service_type": [None, quote.service_type]})
        tasks.open_quote_task(quote, None)
        return Response(QuoteRequestSerializer(quote).data, status=status.HTTP_201_CREATED)


class _QuoteView(CustomerAPIView):
    def get_quote(self, pk: int) -> QuoteRequest:
        return get_object_or_404(QuoteRequest.objects.filter(customer=self.customer).select_related("created_order"),
                                 pk=pk)


@extend_schema(tags=["app: requests"], responses=QuoteRequestSerializer)
class QuoteDetailView(_QuoteView):
    def get(self, request, pk: int):
        return Response(QuoteRequestSerializer(self.get_quote(pk)).data)


@extend_schema(tags=["app: requests"], request=ReplySerializer, responses=QuoteRequestSerializer)
class QuoteReplyView(_QuoteView):
    accept = True

    def post(self, request, pk: int):
        s = ReplySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        note = s.validated_data["note"].strip()
        default = "Accepted by the customer in the app" if self.accept else "Declined by the customer in the app"
        quote = run(quotes.record_reply, self.get_quote(pk), accepted=self.accept, user=None,
                    note=f"{default}: {note}" if note else default, request=request)
        return Response(QuoteRequestSerializer(quote).data)


class QuoteDeclineView(QuoteReplyView):
    accept = False


# --------------------------------------------------------------------------- #
# Support chat (appears in the admin Chat inbox as a Web conversation)
# --------------------------------------------------------------------------- #
def _message(m: Message) -> dict:
    return {"id": m.pk, "from": "me" if m.sender == Message.Sender.CUSTOMER else
            ("agiza" if m.sender == Message.Sender.AGENT else "system"),
            "body": m.body, "author": m.author.full_name.split(" ")[0] if m.author_id else None,
            "created_at": m.created_at}


@extend_schema(tags=["app: support"], request=ChatSendSerializer, responses=None)
class SupportChatView(CustomerAPIView):
    def _conversation(self):
        handle = f"+{self.request.user.phone}"
        return (Conversation.objects.filter(channel="web", customer=self.customer, contact_handle=handle)
                .order_by("-last_message_at").first())

    def get(self, request):
        conv = self._conversation()
        rows = [] if conv is None else (conv.messages.exclude(sender=Message.Sender.INTERNAL)
                                        .select_related("author").order_by("created_at", "id"))
        return Response({"messages": [_message(m) for m in rows]})

    @transaction.atomic
    def post(self, request):
        s = ChatSendSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        body = s.validated_data["body"].strip()
        if not body:
            raise ValidationError({"body": ["Type a message."]})
        msg = chat.receive(channel="web", handle=f"+{request.user.phone}", name=self.customer.full_name, body=body)
        conv = msg.conversation
        if conv.customer_id != self.customer.pk:  # link by account, not by phone-number guess
            conv.customer = self.customer
            conv.save(update_fields=["customer", "updated_at"])
        return Response(_message(msg), status=status.HTTP_201_CREATED)
