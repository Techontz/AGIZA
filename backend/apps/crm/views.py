from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.constants import Module
from apps.accounts.permissions import HasModulePermission
from apps.core.audit import record_audit
from apps.catalog.models import Category
from apps.core.workflow import run
from apps.orders.serializers import _person
from apps.parties.models import Customer

from . import services
from .models import (
    Campaign,
    CampaignRecipient,
    CustomerInterest,
    RuleField,
    RuleOperator,
    Tag,
    TagRule,
    TagRuleCondition,
    TagRuleRun,
)


# --------------------------------------------------------------------------- #
# Serializers
# --------------------------------------------------------------------------- #
class TagSerializer(serializers.ModelSerializer):
    customers = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Tag
        fields = ["id", "name", "customers"]


class ConditionSerializer(serializers.ModelSerializer):
    field_display = serializers.CharField(source="get_field_display", read_only=True)
    operator_display = serializers.CharField(source="get_operator_display", read_only=True)

    class Meta:
        model = TagRuleCondition
        fields = ["id", "field", "field_display", "operator", "operator_display", "value"]


class RunSerializer(serializers.ModelSerializer):
    run_by = serializers.SerializerMethodField()

    class Meta:
        model = TagRuleRun
        fields = ["id", "matched", "added", "removed", "trigger", "run_by", "created_at"]

    def get_run_by(self, obj) -> dict | None:
        return _person(obj.run_by)


class RuleSerializer(serializers.ModelSerializer):
    conditions = ConditionSerializer(many=True, read_only=True)
    tag = serializers.CharField(source="tag.name", read_only=True)
    tagged_customers = serializers.IntegerField(read_only=True, default=0)
    last_run = serializers.SerializerMethodField()

    class Meta:
        model = TagRule
        fields = ["id", "name", "tag", "enabled", "conditions", "last_run_at", "last_matched", "tagged_customers",
                  "last_run", "created_at", "updated_at"]

    def get_last_run(self, obj) -> dict | None:
        runs = list(obj.runs.all()[:1])
        return RunSerializer(runs[0]).data if runs else None


class ConditionWriteSerializer(serializers.Serializer):
    field = serializers.ChoiceField(choices=RuleField.choices)
    operator = serializers.ChoiceField(choices=RuleOperator.choices)
    value = serializers.CharField(max_length=80)


class RuleWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    tag = serializers.CharField(max_length=60)
    enabled = serializers.BooleanField(default=True)
    conditions = ConditionWriteSerializer(many=True)


class InterestSerializer(serializers.ModelSerializer):
    # Staff pick a category or subcategory; the app's home screen then shows this customer its products.
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False, allow_null=True)
    category_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomerInterest
        fields = ["id", "label", "category", "category_name", "confidence", "source", "updated_at"]
        read_only_fields = ["id", "source", "updated_at"]
        extra_kwargs = {"label": {"required": False, "allow_blank": True}, "confidence": {"required": False}}

    def get_category_name(self, obj) -> str | None:
        return str(obj.category) if obj.category_id else None

    def validate(self, attrs):
        if not attrs.get("category") and not attrs.get("label", "").strip():
            raise serializers.ValidationError({"category": "Choose a category or enter an interest."})
        return attrs


class CriteriaSerializer(serializers.Serializer):
    tags = serializers.ListField(child=serializers.CharField(max_length=60), required=False, default=list)
    interests = serializers.ListField(child=serializers.CharField(max_length=80), required=False, default=list)
    activity = serializers.ChoiceField(choices=Campaign.Activity.choices, default=Campaign.Activity.ALL)
    min_orders = serializers.IntegerField(min_value=0, default=0)


class CampaignSerializer(serializers.ModelSerializer):
    tags = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    channel_display = serializers.CharField(source="get_channel_display", read_only=True)
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = ["id", "reference", "name", "channel", "channel_display", "subject", "message", "tags", "interests",
                  "activity", "min_orders", "status", "status_display", "audience_count", "sent_count",
                  "failed_count", "sent_at", "status_note", "created_by", "created_at"]

    def get_tags(self, obj) -> list[str]:
        return [t.name for t in obj.tags.all()]

    def get_created_by(self, obj) -> dict | None:
        return _person(obj.created_by)


class CampaignWriteSerializer(CriteriaSerializer):
    name = serializers.CharField(max_length=150)
    channel = serializers.ChoiceField(choices=Campaign.Channel.choices)
    subject = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    message = serializers.CharField()


class RecipientSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()

    class Meta:
        model = CampaignRecipient
        fields = ["id", "customer", "destination", "status", "error", "sent_at"]

    def get_customer(self, obj) -> dict:
        return {"id": obj.customer_id, "reference": obj.customer.reference, "full_name": obj.customer.full_name}


# --------------------------------------------------------------------------- #
# Views
# --------------------------------------------------------------------------- #
@extend_schema(tags=["crm"])
class TagViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """All tags with how many customers carry each."""

    module = Module.PEOPLE
    read_modules = (Module.SETTINGS, Module.CHAT)
    permission_classes = [HasModulePermission]
    serializer_class = TagSerializer
    pagination_class = None
    search_fields = ["name"]

    def get_queryset(self):
        return Tag.objects.annotate(customers=Count("customer_links")).order_by("name")


class CustomerTagsView(APIView):
    """Add a manual tag (POST {name}) or remove one (DELETE ?link=<id>) on a customer."""

    module = Module.PEOPLE
    permission_classes = [HasModulePermission]
    required_access = {"POST": "edit", "DELETE": "edit"}

    @extend_schema(tags=["crm"], request=TagSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        run(services.add_manual_tag, customer, str(request.data.get("name", "")), user=request.user, request=request)
        return Response(self._tags(customer), status=status.HTTP_201_CREATED)

    @extend_schema(tags=["crm"], responses=OpenApiTypes.OBJECT)
    def delete(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        run(services.remove_tag, customer, int(request.query_params.get("link", 0)), user=request.user,
            request=request)
        return Response(self._tags(customer))

    def _tags(self, customer):
        return [{"id": t.id, "name": t.tag.name, "type": "system" if t.source == "rule" else "manual",
                 "created_at": t.created_at} for t in customer.tag_links.select_related("tag")]


class CustomerInterestsView(APIView):
    """Interests of a customer: GET list, POST {category | label, confidence} manual interest, DELETE ?id=, PUT = recompute."""

    module = Module.PEOPLE
    permission_classes = [HasModulePermission]
    required_access = {"POST": "edit", "DELETE": "edit", "PUT": "edit"}
    serializer_class = InterestSerializer

    def _list(self, customer):
        return InterestSerializer(customer.interests.select_related("category__parent"), many=True).data

    @extend_schema(tags=["crm"], responses=InterestSerializer(many=True))
    def get(self, request, pk):
        return Response(self._list(get_object_or_404(Customer, pk=pk)))

    @extend_schema(tags=["crm"], request=InterestSerializer, responses=InterestSerializer(many=True))
    def post(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        s = InterestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        category = s.validated_data.get("category")
        label = (str(category) if category else s.validated_data["label"]).strip().lower()[:80]
        CustomerInterest.objects.update_or_create(customer=customer, label=label, defaults={
            "confidence": s.validated_data.get("confidence", 100), "category": category,
            "source": CustomerInterest.Source.MANUAL})
        record_audit(action="update", request=request, instance=customer, changes={"interest": [None, label]})
        return Response(self._list(customer), status=status.HTTP_201_CREATED)

    @extend_schema(tags=["crm"], responses=InterestSerializer(many=True))
    def delete(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        customer.interests.filter(pk=request.query_params.get("id"), source=CustomerInterest.Source.MANUAL).delete()
        return Response(self._list(customer))

    @extend_schema(tags=["crm"], responses=InterestSerializer(many=True))
    def put(self, request, pk):
        customer = get_object_or_404(Customer, pk=pk)
        services.recompute_interests(customer)
        return Response(self._list(customer))


@extend_schema(tags=["crm"])
class TagRuleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """The Tag Rules Engine (Settings). Saving a rule runs it immediately."""

    module = Module.SETTINGS
    read_modules = (Module.PEOPLE,)
    permission_classes = [HasModulePermission]
    serializer_class = RuleSerializer
    pagination_class = None
    required_access = {"create": "manage", "partial_update": "manage", "destroy": "manage", "run": "manage",
                       "run_all": "manage", "toggle": "manage"}

    def get_queryset(self):
        return (TagRule.objects.select_related("tag").prefetch_related(
            "conditions", Prefetch("runs", queryset=TagRuleRun.objects.select_related("run_by")))
            .annotate(tagged_customers=Count("assignments", distinct=True)).order_by("name", "id"))

    def _respond(self, rule, code=status.HTTP_200_OK):
        return Response(RuleSerializer(self.get_queryset().get(pk=rule.pk)).data, status=code)

    @extend_schema(request=RuleWriteSerializer, responses={201: RuleSerializer})
    def create(self, request):
        s = RuleWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        rule = run(services.save_rule, name=d["name"], tag_name=d["tag"], conditions=d["conditions"],
                   enabled=d["enabled"], user=request.user, request=request)
        return self._respond(rule, status.HTTP_201_CREATED)

    @extend_schema(request=RuleWriteSerializer, responses=RuleSerializer)
    def partial_update(self, request, pk=None):
        rule = self.get_object()
        s = RuleWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        rule = run(services.save_rule, name=d["name"], tag_name=d["tag"], conditions=d["conditions"],
                   enabled=d["enabled"], user=request.user, rule=rule, request=request)
        return self._respond(rule)

    def destroy(self, request, pk=None):
        run(services.delete_rule, self.get_object(), user=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        rule = self.get_object()
        rule.enabled = not rule.enabled
        rule.save(update_fields=["enabled", "updated_at"])
        record_audit(action="update", request=request, instance=rule, changes={"enabled": [not rule.enabled,
                                                                                          rule.enabled]})
        services.evaluate_rule(rule, trigger="save", user=request.user, request=request)
        return self._respond(rule)

    @action(detail=True, methods=["post"])
    def run(self, request, pk=None):
        services.evaluate_rule(self.get_object(), trigger="manual", user=request.user, request=request)
        return self._respond(self.get_object())

    @action(detail=False, methods=["post"], url_path="run-all")
    def run_all(self, request):
        runs = services.evaluate_all(trigger="manual", user=request.user)
        return Response({"rules": len(runs), "added": sum(r.added for r in runs),
                         "removed": sum(r.removed for r in runs)})

    @extend_schema(responses=RunSerializer(many=True))
    @action(detail=True)
    def runs(self, request, pk=None):
        return Response(RunSerializer(self.get_object().runs.select_related("run_by")[:50], many=True).data)

    @action(detail=False)
    def fields(self, request):
        return Response({"fields": [{"value": v, "label": lb} for v, lb in RuleField.choices],
                         "operators": [{"value": v, "label": lb} for v, lb in RuleOperator.choices]})


@extend_schema(tags=["crm"])
class CampaignViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                      viewsets.GenericViewSet):
    """Campaigns: audience from real customer data, sent through the configured channel provider."""

    module = Module.PEOPLE
    permission_classes = [HasModulePermission]
    serializer_class = CampaignSerializer
    filterset_fields = ["status", "channel"]
    search_fields = ["name", "reference"]
    required_access = {"estimate": "view", "send": "manage"}

    def get_queryset(self):
        return Campaign.objects.select_related("created_by").prefetch_related("tags").order_by("-created_at", "-id")

    @extend_schema(request=CampaignWriteSerializer, responses={201: CampaignSerializer})
    def create(self, request):
        s = CampaignWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = dict(s.validated_data)
        tags = [services.get_tag(t) for t in d.pop("tags")]
        campaign = Campaign.objects.create(created_by=request.user, **d,
                                           audience_count=services.audience(tags=tags, interests=d["interests"],
                                                                            activity=d["activity"],
                                                                            min_orders=d["min_orders"]).count())
        campaign.tags.set(tags)
        record_audit(action="create", request=request, instance=campaign,
                     changes={"audience": [None, campaign.audience_count], "channel": [None, campaign.channel]})
        return Response(CampaignSerializer(self.get_queryset().get(pk=campaign.pk)).data,
                        status=status.HTTP_201_CREATED)

    @extend_schema(request=CriteriaSerializer, responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["post"])
    def estimate(self, request):
        """Live audience count for the targeting modal (by channel reachability)."""
        s = CriteriaSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(services.estimate(**s.validated_data))

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        campaign = run(services.send_campaign, self.get_object(), user=request.user, request=request)
        return Response(CampaignSerializer(self.get_queryset().get(pk=campaign.pk)).data)

    @extend_schema(responses=RecipientSerializer(many=True))
    @action(detail=True)
    def recipients(self, request, pk=None):
        rows = self.get_object().recipients.select_related("customer")[:500]
        return Response(RecipientSerializer(rows, many=True).data)

    @action(detail=False)
    def options(self, request):
        """Tags and interest labels that exist in the data (for the targeting chips)."""
        tags = list(Tag.objects.annotate(n=Count("customer_links")).filter(n__gt=0).values_list("name", flat=True))
        interests = sorted(set(CustomerInterest.objects.values_list("label", flat=True)))
        from apps.notifications.providers import status as channel_status

        return Response({"tags": tags, "interests": interests, "channels": channel_status()})
