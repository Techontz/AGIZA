"""
"Buy for me" and "Deliver for me" requests: the old AGIZA app's sourcing flow on
top of Intake & Quotes. The customer describes the item, staff quote it in the
admin, the customer accepts or declines in the app, and staff approve the accepted
quote into an international order, which the customer then tracks and pays.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.chat import services as chat
from apps.chat.models import Conversation, Message
from apps.core.audit import record_audit
from apps.core.pagination import StandardPagination
from apps.core.uploads import IMAGE_TYPES, file_response, validate_upload
from apps.core.workflow import run
from apps.locations.models import Country
from apps.quotes import services as quotes
from apps.quotes.models import QuoteAttachment, QuoteRequest, QuoteStatusHistory, ServiceType
from apps.tasks import services as tasks

from ..serializers import ChatSendSerializer, QuoteCreateSerializer, QuoteRequestSerializer, ReplySerializer
from .base import CustomerAPIView, WriteThrottleMixin

# Photos and (multi-item quotations) each item's photos, order and origin, as the app shows them.
QUOTE_PREFETCH = ("attachments", "items__attachments", "items__created_order", "items__origin_country")

REQUEST_MARKER = {"buy_for_me": "[Buy for me]", "deliver_for_me": "[Deliver for me]",
                  "local_delivery": "[Local delivery]"}


def _description(data: dict) -> str:
    lines = [f"{REQUEST_MARKER[data['request_type']]} {data['item_name'].strip()}", f"Quantity: {data['quantity']}"]
    if data.get("product"):
        p = data["product"]
        lines.append(f"Shop product (out of stock): {p.name} (#{p.pk}{f', SKU {p.sku}' if p.sku else ''})")
    if data.get("link"):
        lines.append(f"Link: {data['link']}")
    if data.get("weight_kg"):
        lines.append(f"Approx. weight: {data['weight_kg']} kg")
    if data.get("tracking_number"):
        lines.append(f"Supplier tracking number: {data['tracking_number'].strip()}")
    if data.get("shipping_method"):
        lines.append(f"Preferred shipping: {QuoteCreateSerializer.SHIPPING_METHODS[data['shipping_method']]}")
    if data.get("pickup_city"):
        pickup = ", ".join(x for x in [data.get("pickup_address", "").strip(), data["pickup_city"].name] if x)
        lines.append(f"Pick up: {pickup}")
        dropoff = ", ".join(x for x in [data.get("dropoff_address", "").strip(), data["destination_city"].name] if x)
        lines.append(f"Deliver to: {dropoff}")
    if data.get("sender_name", "").strip() or data.get("sender_phone", "").strip():
        lines.append(f"Sender: {data.get('sender_name', '').strip()} {data.get('sender_phone', '').strip()}".strip())
    if data.get("contact_name", "").strip() or data.get("contact_phone", "").strip():
        label = "Receiver" if data["request_type"] == "local_delivery" else "Contact"
        lines.append(f"{label}: {data.get('contact_name', '').strip()} {data.get('contact_phone', '').strip()}".strip())
    if data.get("package_size"):
        lines.append(f"Package size: {QuoteCreateSerializer.PACKAGE_SIZES[data['package_size']]}")
    if data.get("details", "").strip():
        lines.append(data["details"].strip())
    lines.append("Submitted in the AGIZA app")
    return "\n".join(lines)


@extend_schema(tags=["app: requests"], request=QuoteCreateSerializer, responses=QuoteRequestSerializer)
class QuoteListView(CustomerAPIView):
    def get(self, request):
        qs = QuoteRequest.objects.filter(customer=self.customer).select_related("created_order").prefetch_related(*QUOTE_PREFETCH)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(QuoteRequestSerializer(page, many=True, context={"request": request}).data)

    @transaction.atomic
    def post(self, request):
        s = QuoteCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        if data["request_type"] == "local_delivery":
            service_type, origin = ServiceType.EXPRESS, data["pickup_city"].name
        elif not data.get("origin_country", "").strip():
            service_type, origin = ServiceType.INTERNATIONAL, ""  # staff choose where to source it
        else:
            country = Country.objects.filter(iso2=data["origin_country"].upper(), is_active=True).first()
            if country is None:
                raise ValidationError({"origin_country": ["Choose a country AGIZA ships from."]})
            service_type, origin = ServiceType.INTERNATIONAL, country.name
        city = data.get("destination_city")
        if city is None:  # no city on the form: the customer's default delivery address, if any
            home = self.customer.addresses.select_related("city").first()
            city = home.city if home else None
        quote = QuoteRequest.objects.create(
            customer=self.customer, service_type=service_type, description=_description(data),
            origin=origin, destination=city.name if city else "",
        )
        # Same steps as a quotation staff enter in Intake & Quotes: history, audit, follow-up task.
        QuoteStatusHistory.objects.create(quote=quote, to_status=quote.status, note="Requested in the AGIZA app")
        record_audit(action="create", request=request, instance=quote,
                     changes={"customer": [None, quote.customer_id], "service_type": [None, quote.service_type]})
        tasks.open_quote_task(quote, None)
        return Response(QuoteRequestSerializer(quote, context={"request": request}).data, status=status.HTTP_201_CREATED)


class _QuoteView(CustomerAPIView):
    def get_quote(self, pk: int) -> QuoteRequest:
        quotes = (QuoteRequest.objects.filter(customer=self.customer)
                  .select_related("created_order").prefetch_related(*QUOTE_PREFETCH))
        return get_object_or_404(quotes, pk=pk)


MAX_REQUEST_PHOTOS = 5


@extend_schema(tags=["app: requests"], responses=QuoteRequestSerializer)
class QuotePhotoUploadView(WriteThrottleMixin, _QuoteView):
    """POST a photo (multipart `file`) of the item while AGIZA hasn't quoted the request yet."""

    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "uploads"

    def post(self, request, pk: int):
        quote = self.get_quote(pk)
        if quote.status not in ("new", "waiting_reply") or \
                quote.attachments.filter(from_agiza=False).count() >= MAX_REQUEST_PHOTOS:
            return Response({"error": {"code": "conflict", "message": "You can't add more photos to this request.",
                                       "details": None}}, status=409)
        upload = request.FILES.get("file")
        content_type = validate_upload(upload, allowed=IMAGE_TYPES)
        QuoteAttachment.objects.create(quote=quote, file=upload, content_type=content_type)
        return Response(QuoteRequestSerializer(self.get_quote(pk), context={"request": request}).data, status=201)


@extend_schema(tags=["app: requests"], responses={(200, "image/*"): OpenApiTypes.BINARY})
class QuotePhotoFileView(CustomerAPIView):
    throttle_classes = []

    def get(self, request, pk: int, photo_id: int):
        photo = get_object_or_404(QuoteAttachment, pk=photo_id, quote_id=pk, quote__customer=self.customer)
        response = file_response(photo.file, photo.content_type)
        response["Cache-Control"] = "private, max-age=604800, immutable"  # a photo's file never changes
        return response


@extend_schema(tags=["app: requests"], responses=QuoteRequestSerializer)
class QuoteDetailView(_QuoteView):
    def get(self, request, pk: int):
        return Response(QuoteRequestSerializer(self.get_quote(pk), context={"request": request}).data)


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
        return Response(QuoteRequestSerializer(quote, context={"request": request}).data)


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


def _room_key(conv: Conversation) -> str:
    if conv.order_id:
        return f"order:{conv.order.reference}"
    if conv.quote_id:
        return f"quote:{conv.quote_id}"
    if conv.return_request_id:
        return f"return:{conv.return_request.reference}"
    return ""


def _room_title(conv: Conversation) -> tuple[str, str]:
    """(kind, title) as the app lists the room."""
    if conv.order_id:
        return "order", f"Order {conv.order.reference}"
    if conv.quote_id:
        return "quote", f"Quotation {conv.quote.reference}"
    if conv.return_request_id:
        return "return", f"Return {conv.return_request.reference}"
    return "general", "AGIZA Support"


class _SupportView(WriteThrottleMixin, CustomerAPIView):
    """The customer's chat with AGIZA: a general room plus one room per order, quotation or return.
    Rooms are web-channel conversations, so staff answer them in the admin Chat inbox as usual."""

    throttle_scope = "support"

    @property
    def handle(self) -> str:
        return f"+{self.request.user.phone}"

    def room(self, key: str) -> dict:
        """Resolve `order:<ref>`, `quote:<id>` or `return:<ref>` (empty = general), owned by this customer."""
        from apps.orders.models import Order
        from apps.returns.models import ReturnRequest

        kind, _, value = (key or "").partition(":")
        if not kind or kind == "general":
            return {}
        if kind == "order":
            return {"order": get_object_or_404(Order, customer=self.customer, reference=value)}
        if kind == "quote" and value.isdigit():
            quote = get_object_or_404(QuoteRequest.objects.select_related("created_order"), customer=self.customer,
                                      pk=int(value))
            order = getattr(quote, "created_order", None)
            # Once approved, a quotation's chat is its order's chat.
            return {"order": order} if order else {"quote": quote}
        if kind == "return":
            return {"return_request": get_object_or_404(ReturnRequest, order__customer=self.customer, reference=value)}
        raise ValidationError({"room": ["Unknown chat room."]})

    def conversations(self):
        return Conversation.objects.filter(channel="web", customer=self.customer, contact_handle=self.handle)

    def conversation(self, room: dict):
        return self.conversations().filter(**chat.room_filter(room)).order_by("-last_message_at").first()


@extend_schema(tags=["app: support"], responses=OpenApiTypes.OBJECT)
class SupportRoomListView(_SupportView):
    """GET the customer's chat rooms, newest activity first; the general room is always listed first."""

    def get(self, request):
        rows = (self.conversations().exclude(status=Conversation.Status.ARCHIVED)
                .select_related("order", "quote", "return_request").order_by("-last_message_at", "-id"))
        rooms, seen = [], set()
        for conv in rows:
            key = _room_key(conv)
            if key in seen:
                continue
            seen.add(key)
            kind, title = _room_title(conv)
            rooms.append({"key": key, "kind": kind, "title": title, "preview": conv.last_message_preview,
                          "last_message_at": conv.last_message_at})
        if "" not in seen:
            rooms.append({"key": "", "kind": "general", "title": "AGIZA Support", "preview": "",
                          "last_message_at": None})
        rooms.sort(key=lambda r: r["key"] != "")  # general first, then by activity (stable sort)
        return Response({"rooms": rooms})


@extend_schema(tags=["app: support"], request=ChatSendSerializer, responses=None)
class SupportChatView(_SupportView):
    """GET/POST messages in a room (`?room=order:<ref>` etc.; no room = the general AGIZA Support room)."""

    def get(self, request):
        conv = self.conversation(self.room(request.query_params.get("room", "")))
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
        room = self.room(request.data.get("room", "") or request.query_params.get("room", ""))
        msg = chat.receive(channel="web", handle=self.handle, name=self.customer.full_name, body=body, room=room)
        conv = msg.conversation
        if conv.customer_id != self.customer.pk:  # link by account, not by phone-number guess
            conv.customer = self.customer
            conv.save(update_fields=["customer", "updated_at"])
        return Response(_message(msg), status=status.HTTP_201_CREATED)
