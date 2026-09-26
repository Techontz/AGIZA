import hashlib
import hmac
import json
import logging

import django_filters
from django.conf import settings
from django.db.models import Count, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.models import User
from apps.accounts.permissions import HasModulePermission
from apps.core.workflow import run
from apps.orders.models import Order
from apps.orders.serializers import _dec, _person
from apps.parties.models import Customer
from apps.quotes.models import QuoteRequest

from . import services
from .models import Channel, Conversation, Message, QuickReply, WebhookEvent

logger = logging.getLogger("apps.chat")


class MessageSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    quotation = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "sender", "body", "author", "quotation", "delivery_status", "delivery_error", "created_at"]

    def get_author(self, obj) -> dict | None:
        return _person(obj.author)

    def get_quotation(self, obj) -> dict | None:
        q = obj.quote
        if q is None:
            return None
        return {"id": q.id, "reference": q.reference, "description": q.description, "amount": _dec(q.quoted_amount),
                "service_type": q.get_service_type_display(), "estimated_delivery": q.estimated_delivery,
                "notes": q.response_notes, "status": q.status, "status_display": q.get_status_display()}


class ConversationSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    order = serializers.SerializerMethodField()
    quote = serializers.SerializerMethodField()
    assigned_agent = serializers.SerializerMethodField()
    active_handler = serializers.SerializerMethodField()
    lifecycle = serializers.SerializerMethodField()
    response_status = serializers.SerializerMethodField()
    client_action_state = serializers.SerializerMethodField()
    client_value = serializers.SerializerMethodField()
    unread_count = serializers.IntegerField(read_only=True, default=0)
    channel_display = serializers.CharField(source="get_channel_display", read_only=True)

    class Meta:
        model = Conversation
        fields = ["id", "reference", "channel", "channel_display", "contact_name", "contact_handle", "customer",
                  "order", "quote", "status", "response_status", "department", "assigned_agent", "active_handler",
                  "handler_since", "escalated_to", "escalated_at", "follow_up_at", "last_message_at",
                  "last_message_preview", "unread_count", "lifecycle", "client_action_state", "client_value",
                  "created_at"]

    def get_customer(self, obj) -> dict | None:
        c = obj.customer
        return {"id": c.id, "reference": c.reference, "full_name": c.full_name, "phone": c.phone} if c else None

    def get_order(self, obj) -> dict | None:
        o = obj.order
        return {"id": o.id, "reference": o.reference, "order_type": o.order_type} if o else None

    def get_quote(self, obj) -> dict | None:
        q = obj.quote
        return {"id": q.id, "reference": q.reference, "status": q.status} if q else None

    def get_assigned_agent(self, obj) -> dict | None:
        return _person(obj.assigned_agent)

    def get_active_handler(self, obj) -> dict | None:
        return _person(obj.active_handler)

    def get_lifecycle(self, obj) -> str:
        return services.lifecycle(obj)

    def get_response_status(self, obj) -> str:
        return services.response_status(obj)

    def get_client_action_state(self, obj) -> str | None:
        cards = getattr(obj, "quote_cards", None)
        if cards is None:
            cards = list(obj.messages.filter(quote__isnull=False).select_related("quote"))
        return services.client_action_state(obj, cards)

    def get_client_value(self, obj) -> str:
        return services.client_value(getattr(obj, "customer_orders", 0) or 0, getattr(obj, "customer_spent", 0) or 0)


class SendSerializer(serializers.Serializer):
    body = serializers.CharField()
    internal = serializers.BooleanField(default=False)


class QuoteCardSerializer(serializers.Serializer):
    quote = serializers.PrimaryKeyRelatedField(queryset=QuoteRequest.objects.all())


class CreateQuoteSerializer(serializers.Serializer):
    service_type = serializers.ChoiceField(choices=[("international", "International"), ("express", "Express"),
                                                    ("equipment", "Equipment")])
    description = serializers.CharField()
    origin = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    destination = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class AssignAgentSerializer(serializers.Serializer):
    agent = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())


class EscalateSerializer(serializers.Serializer):
    to = serializers.ChoiceField(choices=["management", "procurement", "finance", "sales", "support", "delivery"])
    note = serializers.CharField(required=False, allow_blank=True, default="")


class FollowUpSerializer(serializers.Serializer):
    at = serializers.DateTimeField(allow_null=True)


class LinkSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    order = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all(), required=False, allow_null=True)
    quote = serializers.PrimaryKeyRelatedField(queryset=QuoteRequest.objects.all(), required=False, allow_null=True)


class StartSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    channel = serializers.ChoiceField(choices=Channel.choices, default=Channel.WHATSAPP)
    body = serializers.CharField(required=False, allow_blank=True, default="")


class QuickReplySerializer(serializers.ModelSerializer):
    class Meta:
        model = QuickReply
        fields = ["id", "text", "sort_order", "is_active"]


class ConversationFilter(django_filters.FilterSet):
    view = django_filters.ChoiceFilter(
        choices=[("mine", "Mine"), ("unassigned", "Unassigned"), ("waiting", "Waiting for team"),
                 ("urgent", "Urgent"), ("follow_up", "Follow-up due"), ("archived", "Archived")],
        method="filter_view")

    class Meta:
        model = Conversation
        fields = ["channel", "status", "department", "assigned_agent", "view"]

    def filter_view(self, qs, name, value):
        user = self.request.user
        now = timezone.now()
        return {
            "mine": qs.filter(Q(assigned_agent=user) | Q(active_handler=user)),
            "unassigned": qs.filter(assigned_agent__isnull=True),
            "waiting": qs.filter(response_status__in=["waiting_team", "urgent", "new"]),
            "urgent": qs.filter(Q(response_status="urgent") | Q(escalated_to__gt="") | Q(
                response_status="waiting_team", last_customer_message_at__lt=now - services.URGENT_AFTER)),
            "follow_up": qs.filter(follow_up_at__lte=now),
            "archived": qs.filter(status=Conversation.Status.ARCHIVED),
        }[value]


@extend_schema(tags=["chat"])
class ConversationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Transaction chat. All actions are recorded as messages or system events in the conversation."""

    module = Module.CHAT
    permission_classes = [HasModulePermission]
    serializer_class = ConversationSerializer
    filterset_class = ConversationFilter
    search_fields = ["contact_name", "contact_handle", "reference", "customer__full_name", "last_message_preview"]
    required_access = {"note": "edit", "mark_read": "view"}

    def get_queryset(self):
        unread = (Message.objects.filter(conversation=OuterRef("pk"), sender="customer")
                  .filter(Q(created_at__gt=OuterRef("team_read_at")) | Q(conversation__team_read_at__isnull=True))
                  .order_by().values("conversation").annotate(n=Count("id")).values("n"))
        orders = (Order.objects.filter(customer=OuterRef("customer")).exclude(status="cancelled").order_by()
                  .values("customer").annotate(n=Count("id")).values("n"))
        qs = (Conversation.objects.select_related("customer", "order", "quote", "assigned_agent", "active_handler")
              .prefetch_related(Prefetch("messages", queryset=Message.objects.filter(quote__isnull=False)
                                         .select_related("quote").order_by("created_at", "id"), to_attr="quote_cards"))
              .annotate(unread_count=Coalesce(Subquery(unread), 0), customer_orders=Coalesce(Subquery(orders), 0))
              .order_by("-last_message_at", "-id"))
        if self.action == "list" and "status" not in self.request.query_params and \
                self.request.query_params.get("view") != "archived":
            qs = qs.filter(status=Conversation.Status.OPEN)
        return qs

    def _respond(self, conv, code=status.HTTP_200_OK):
        return Response(ConversationSerializer(self.get_queryset().get(pk=conv.pk)).data, status=code)

    @extend_schema(responses=MessageSerializer(many=True))
    @action(detail=True)
    def messages(self, request, pk=None):
        conv = self.get_object()
        rows = conv.messages.select_related("author", "quote").order_by("created_at", "id")
        return Response(MessageSerializer(rows, many=True).data)

    @extend_schema(request=SendSerializer, responses=MessageSerializer)
    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        s = SendSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        conv = self.get_object()
        if s.validated_data["internal"]:
            msg = run(services.add_note, conv, user=request.user, body=s.validated_data["body"])
        else:
            msg = run(services.send_message, conv, user=request.user, body=s.validated_data["body"], request=request)
        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=QuoteCardSerializer, responses=MessageSerializer)
    @action(detail=True, methods=["post"], url_path="send-quote")
    def send_quote(self, request, pk=None):
        s = QuoteCardSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        msg = run(services.send_quote, self.get_object(), s.validated_data["quote"], user=request.user,
                  request=request)
        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=CreateQuoteSerializer)
    @action(detail=True, methods=["post"], url_path="create-quote")
    def create_quote(self, request, pk=None):
        s = CreateQuoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        run(services.create_quote, self.get_object(), user=request.user, request=request, **s.validated_data)
        return self._respond(self.get_object())

    @action(detail=True, methods=["post"], url_path="take-over")
    def take_over(self, request, pk=None):
        return self._respond(run(services.take_over, self.get_object(), user=request.user))

    @action(detail=True, methods=["post"])
    def release(self, request, pk=None):
        return self._respond(run(services.release, self.get_object(), user=request.user))

    @extend_schema(request=AssignAgentSerializer)
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        s = AssignAgentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._respond(run(services.assign, self.get_object(), s.validated_data["agent"], user=request.user,
                                 request=request))

    @extend_schema(request=EscalateSerializer)
    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        s = EscalateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._respond(run(services.escalate, self.get_object(), user=request.user, request=request,
                                 **s.validated_data))

    @extend_schema(request=FollowUpSerializer)
    @action(detail=True, methods=["post"], url_path="follow-up")
    def follow_up(self, request, pk=None):
        s = FollowUpSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._respond(run(services.set_follow_up, self.get_object(), at=s.validated_data["at"],
                                 user=request.user))

    @extend_schema(request=LinkSerializer)
    @action(detail=True, methods=["post"])
    def link(self, request, pk=None):
        s = LinkSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return self._respond(run(services.link, self.get_object(), user=request.user, request=request,
                                 **{k: v for k, v in s.validated_data.items() if v is not None}))

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        services.mark_read(self.get_object())
        return self._respond(self.get_object())

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._respond(run(services.set_status, self.get_object(), Conversation.Status.ARCHIVED,
                                 user=request.user))

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        return self._respond(run(services.set_status, self.get_object(), Conversation.Status.OPEN,
                                 user=request.user))

    @extend_schema(request=StartSerializer)
    @action(detail=False, methods=["post"])
    def start(self, request):
        """Start a conversation with a known customer (outbound)."""
        s = StartSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        c = s.validated_data["customer"]
        handle = c.phone or c.email or c.reference
        conv = Conversation.objects.create(channel=s.validated_data["channel"], contact_name=c.full_name,
                                           contact_handle=handle, customer=c, assigned_agent=request.user,
                                           last_message_at=timezone.now())
        if s.validated_data["body"].strip():
            run(services.send_message, conv, user=request.user, body=s.validated_data["body"], request=request)
        return self._respond(conv, status.HTTP_201_CREATED)

    @action(detail=False)
    def stats(self, request):
        qs = Conversation.objects.filter(status=Conversation.Status.OPEN)
        return Response({
            "open": qs.count(),
            "mine": qs.filter(Q(assigned_agent=request.user) | Q(active_handler=request.user)).count(),
            "unassigned": qs.filter(assigned_agent__isnull=True).count(),
            "waiting_team": qs.filter(response_status__in=["waiting_team", "urgent", "new"]).count(),
            "by_channel": dict(qs.values_list("channel").annotate(n=Count("id"))),
        })

    @action(detail=False)
    def agents(self, request):
        """Staff who can take conversations, with how many open conversations each handles."""
        qs = (User.objects.filter(is_active=True).exclude(staff_level="driver")
              .annotate(open_chats=Count("assigned_conversations", filter=Q(assigned_conversations__status="open")))
              .order_by("full_name"))
        return Response([{"id": u.id, "full_name": u.full_name, "department": u.get_department_display(),
                          "open_chats": u.open_chats} for u in qs])

    @action(detail=False)
    def channels(self, request):
        from apps.notifications.providers import status as channel_status

        return Response(channel_status())


@extend_schema(tags=["chat"])
class QuickReplyViewSet(viewsets.ModelViewSet):
    module = Module.CHAT
    permission_classes = [HasModulePermission]
    serializer_class = QuickReplySerializer
    pagination_class = None
    required_access = {"create": "manage", "partial_update": "manage", "update": "manage", "destroy": "manage"}

    def get_queryset(self):
        qs = QuickReply.objects.order_by("sort_order", "id")
        return qs if self.action != "list" or self.request.query_params.get("all") else qs.filter(is_active=True)


# --------------------------------------------------------------------------- #
# Channel webhooks — disabled until the channel's secrets are configured.
# --------------------------------------------------------------------------- #
class WebhookThrottle(AnonRateThrottle):
    rate = "600/min"


def _valid_signature(secret: str, body: bytes, header: str) -> bool:
    if not secret or not header:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    candidate = header if header.startswith("sha256=") else f"sha256={header}"
    return hmac.compare_digest(expected, candidate)


class MetaWebhookView(APIView):
    """WhatsApp Cloud API and Facebook Messenger webhooks (Meta signature: X-Hub-Signature-256)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [WebhookThrottle]
    channel = ""

    def _config(self):
        prefix = "WHATSAPP" if self.channel == Channel.WHATSAPP else "FACEBOOK"
        return getattr(settings, f"{prefix}_VERIFY_TOKEN", ""), getattr(settings, f"{prefix}_APP_SECRET", "")

    @extend_schema(tags=["chat"], exclude=True)
    def get(self, request):
        verify_token, secret = self._config()
        if not (verify_token and secret):
            return HttpResponse("Channel not configured", status=503)
        if request.query_params.get("hub.mode") == "subscribe" and \
                hmac.compare_digest(request.query_params.get("hub.verify_token", ""), verify_token):
            return HttpResponse(request.query_params.get("hub.challenge", ""), content_type="text/plain")
        return HttpResponse("Forbidden", status=403)

    @extend_schema(tags=["chat"], exclude=True)
    def post(self, request):
        verify_token, secret = self._config()
        if not (verify_token and secret):
            return HttpResponse("Channel not configured", status=503)
        raw = request.body
        if not _valid_signature(secret, raw, request.headers.get("X-Hub-Signature-256", "")):
            return HttpResponse("Invalid signature", status=403)
        payload = json.loads(raw or b"{}")
        event = WebhookEvent.objects.create(channel=self.channel, payload=payload)
        try:
            for handle, name, text, ext_id in self.extract(payload):
                services.receive(channel=self.channel, handle=handle, name=name, body=text, external_id=ext_id)
            event.processed = True
        except Exception as exc:  # keep the payload for replay; always 200 so Meta doesn't retry forever
            logger.exception("Webhook processing failed")
            event.error = str(exc)[:255]
        event.save(update_fields=["processed", "error"])
        return HttpResponse("OK")

    def extract(self, payload):
        if self.channel == Channel.WHATSAPP:
            for entry in payload.get("entry", []):
                for change in entry.get("changes", []):
                    value = change.get("value", {})
                    names = {c.get("wa_id"): c.get("profile", {}).get("name", "") for c in value.get("contacts", [])}
                    for m in value.get("messages", []):
                        text = m.get("text", {}).get("body") or f"[{m.get('type', 'message')}]"
                        yield f"+{m['from']}", names.get(m["from"], ""), text, m.get("id", "")
        else:
            for entry in payload.get("entry", []):
                for m in entry.get("messaging", []):
                    if "message" in m and not m["message"].get("is_echo"):
                        yield m["sender"]["id"], "", m["message"].get("text", "[attachment]"), m["message"].get("mid", "")


class WhatsAppWebhookView(MetaWebhookView):
    channel = Channel.WHATSAPP


class FacebookWebhookView(MetaWebhookView):
    channel = Channel.FACEBOOK


class TikTokWebhookView(APIView):
    """TikTok Business messaging webhook (HMAC-SHA256 of the body with the client secret)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [WebhookThrottle]

    @extend_schema(tags=["chat"], exclude=True)
    def post(self, request):
        secret = settings.TIKTOK_CLIENT_SECRET
        if not secret:
            return HttpResponse("Channel not configured", status=503)
        raw = request.body
        if not _valid_signature(secret, raw, request.headers.get("TikTok-Signature", "")):
            return HttpResponse("Invalid signature", status=403)
        payload = json.loads(raw or b"{}")
        event = WebhookEvent.objects.create(channel=Channel.TIKTOK, payload=payload)
        try:
            content = payload.get("content") or {}
            if isinstance(content, str):
                content = json.loads(content)
            sender = content.get("from_user") or content.get("sender") or {}
            text = (content.get("text") or {}).get("body") if isinstance(content.get("text"), dict) else \
                content.get("text")
            if sender and text:
                services.receive(channel=Channel.TIKTOK, handle=str(sender.get("id", sender)),
                                 name=sender.get("display_name", "") if isinstance(sender, dict) else "",
                                 body=text, external_id=str(content.get("message_id", "")))
            event.processed = True
        except Exception as exc:
            logger.exception("TikTok webhook processing failed")
            event.error = str(exc)[:255]
        event.save(update_fields=["processed", "error"])
        return HttpResponse("OK")
