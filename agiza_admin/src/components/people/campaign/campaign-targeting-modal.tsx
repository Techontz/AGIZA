"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Save,
  Send,
  Smartphone,
  Tag as TagIcon,
  TrendingUp,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDialogChrome } from "@/components/people/customer-detail/use-dialog-chrome";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { errorText, fieldErrors } from "@/lib/api/errors";
import {
  crmApi,
  crmKeys,
  type Campaign,
  type CampaignActivity,
  type CampaignChannel,
  type CampaignCriteria,
  type CampaignInput,
} from "@/lib/api/services/crm";
import { cn } from "@/lib/cn";

const CHANNELS: { value: CampaignChannel; label: string; icon: typeof Send }[] = [
  { value: "sms", label: "SMS", icon: Smartphone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "email", label: "Email", icon: Mail },
];

const ACTIVITY: { value: CampaignActivity; label: string }[] = [
  { value: "all", label: "All Users" },
  { value: "active", label: "Active (30 days)" },
  { value: "inactive", label: "Inactive (30+ days)" },
];

const inputCls = "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

function chip(active: boolean, on: string, off: string) {
  return cn("px-3 py-2 rounded-lg text-sm font-medium transition-colors", active ? on : off);
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** What happened after "Send Campaign" / "Save as Draft". */
function Outcome({ campaign }: { campaign: Campaign }) {
  const channel = campaign.channel_display;
  const view = {
    draft: {
      icon: Save,
      box: "bg-gray-50 border-gray-200",
      iconCls: "text-gray-600",
      title: "Saved as draft",
      text: `${campaign.audience_count} customers match this audience. Nothing has been sent yet.`,
    },
    sent: {
      icon: CheckCircle,
      box: "bg-green-50 border-green-200",
      iconCls: "text-green-600",
      title: "Campaign sent",
      text: `Delivered to ${campaign.sent_count} of ${campaign.audience_count} customers by ${channel}.`,
    },
    partial: {
      icon: AlertTriangle,
      box: "bg-yellow-50 border-yellow-200",
      iconCls: "text-yellow-600",
      title: "Partially sent",
      text: `${campaign.sent_count} sent, ${campaign.failed_count} failed out of ${campaign.audience_count} customers.`,
    },
    not_sent: {
      icon: XCircle,
      box: "bg-red-50 border-red-200",
      iconCls: "text-red-600",
      title: `Not sent — ${channel} provider not configured`,
      text: `${campaign.audience_count} recipients queued. They will be reachable once the ${channel} channel is connected in Settings.`,
    },
    cancelled: {
      icon: XCircle,
      box: "bg-gray-50 border-gray-200",
      iconCls: "text-gray-600",
      title: "Cancelled",
      text: "This campaign was cancelled.",
    },
  }[campaign.status];
  const Icon = view.icon;
  return (
    <div className={cn("border rounded-lg p-5", view.box)} role="status">
      <div className="flex items-start gap-3">
        <Icon className={cn("size-6 shrink-0 mt-0.5", view.iconCls)} />
        <div className="min-w-0">
          <p className="font-bold text-gray-900">{view.title}</p>
          <p className="text-sm text-gray-700 mt-1">{view.text}</p>
          {campaign.status_note && <p className="text-sm text-gray-600 mt-2 italic">{campaign.status_note}</p>}
          <p className="text-xs text-gray-500 mt-3">
            {campaign.reference} · {campaign.name} · {channel}
          </p>
        </div>
      </div>
    </div>
  );
}

/** People → "Campaign Targeting" (design: CampaignTargetingModal) with real audience counts and sending. */
export function CampaignTargetingModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const ids = { name: useId(), subject: useId(), message: useId(), min: useId() };
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogChrome(panelRef, onClose);

  const { data: me } = useMe();
  const canCreate = can(me, "people", "edit");
  const canSend = can(me, "people", "manage");

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("sms");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [activity, setActivity] = useState<CampaignActivity>("all");
  const [minOrders, setMinOrders] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Campaign | null>(null);
  /** The draft already created for this exact input (so a retry sends it instead of creating another). */
  const draft = useRef<{ key: string; campaign: Campaign } | null>(null);

  const options = useQuery({ queryKey: crmKeys.campaignOptions, queryFn: crmApi.campaignOptions });

  const criteria = useMemo<CampaignCriteria>(
    () => ({ tags, interests, activity, min_orders: minOrders }),
    [tags, interests, activity, minOrders],
  );
  const debounced = useDebouncedValue(criteria, 400);
  const estimate = useQuery({
    queryKey: crmKeys.estimate(debounced),
    queryFn: () => crmApi.estimate(debounced),
    placeholderData: keepPreviousData,
  });
  const estimating = estimate.isFetching || debounced !== criteria;

  const input: CampaignInput = {
    ...criteria,
    name: name.trim(),
    channel,
    subject: channel === "email" ? subject.trim() : "",
    message: message.trim(),
  };
  const inputKey = JSON.stringify(input);
  const connected = options.data?.channels[channel] ?? false;
  const total = estimate.data?.total ?? 0;
  const reachable = estimate.data?.[channel] ?? 0;
  const channelLabel = CHANNELS.find((c) => c.value === channel)?.label ?? channel;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!input.name) next.name = "Enter a campaign name.";
    if (!input.message) next.message = "Write the message customers will receive.";
    if (channel === "email" && !input.subject) next.subject = "Enter an email subject.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const ensureDraft = async (): Promise<Campaign> => {
    if (draft.current?.key === inputKey) return draft.current.campaign;
    const campaign = await crmApi.createCampaign(input);
    draft.current = { key: inputKey, campaign };
    return campaign;
  };

  const onFail = (e: unknown) => {
    const f = fieldErrors(e);
    if (Object.keys(f).length) setErrors(f);
    toast.error(errorText(e));
  };

  const save = useApiMutation(ensureDraft, {
    invalidate: [crmKeys.campaigns],
    success: (c) => `${c.reference} saved as draft`,
    onSuccess: setResult,
    onError: onFail,
  });

  const send = useApiMutation(
    async () => {
      const campaign = await ensureDraft();
      try {
        return await crmApi.sendCampaign(campaign.id);
      } catch (e) {
        throw new Error(`${campaign.reference} was saved as a draft but not sent: ${errorText(e)}`);
      }
    },
    {
      invalidate: [crmKeys.campaigns],
      onSuccess: (c) => {
        setConfirming(false);
        setResult(c);
        if (c.status === "sent") toast.success(`${c.reference} sent to ${c.sent_count} customers`);
        else if (c.status === "partial") toast.warning(`${c.reference}: ${c.sent_count} sent, ${c.failed_count} failed`);
        else toast.warning(`${c.reference} not sent — ${c.channel_display} provider not configured`);
      },
      onError: (e) => {
        setConfirming(false);
        onFail(e);
      },
    },
  );

  const busy = save.isPending || send.isPending;

  const reset = () => {
    setResult(null);
    draft.current = null;
    setName("");
    setSubject("");
    setMessage("");
    setErrors({});
  };

  const fieldError = (key: string) =>
    errors[key] ? (
      <p className="text-xs text-red-600 mt-1" role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[96vh] sm:max-h-[90vh] overflow-hidden flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-blue-100 p-2 rounded-lg shrink-0">
              <Send className="size-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-bold text-gray-900">
                Campaign Targeting
              </h2>
              <p className="text-sm text-gray-600">Select audience segments for your campaign</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {result ? (
            <Outcome campaign={result} />
          ) : options.isError ? (
            <ErrorState bare message={errorText(options.error)} onRetry={() => options.refetch()} />
          ) : (
            <>
              {/* Campaign Name */}
              <div>
                <label htmlFor={ids.name} className="block text-sm font-semibold text-gray-700 mb-2">
                  Campaign Name <span className="text-red-600">*</span>
                </label>
                <input
                  id={ids.name}
                  type="text"
                  placeholder="e.g., Summer Electronics Sale"
                  value={name}
                  maxLength={150}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={errors.name ? true : undefined}
                  className={cn(inputCls, errors.name && "border-red-400")}
                />
                {fieldError("name")}
              </div>

              {/* Tags Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TagIcon className="size-5 text-gray-700" />
                  <h3 className="font-bold text-gray-900">Target by Tags</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {options.isPending ? (
                    Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-20 rounded-lg" />)
                  ) : options.data.tags.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No tags available</p>
                  ) : (
                    options.data.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={tags.includes(tag)}
                        onClick={() => setTags((p) => toggle(p, tag))}
                        className={chip(tags.includes(tag), "bg-blue-600 text-white", "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                      >
                        {tag}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Interests Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="size-5 text-gray-700" />
                  <h3 className="font-bold text-gray-900">Target by Interests</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {options.isPending ? (
                    Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-9 w-24 rounded-lg" />)
                  ) : options.data.interests.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No categories available</p>
                  ) : (
                    options.data.interests.map((interest) => (
                      <button
                        key={interest}
                        type="button"
                        aria-pressed={interests.includes(interest)}
                        onClick={() => setInterests((p) => toggle(p, interest))}
                        className={cn(
                          chip(interests.includes(interest), "bg-indigo-600 text-white", "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"),
                          "capitalize",
                        )}
                      >
                        {interest}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Activity Filter */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="size-5 text-gray-700" />
                  <h3 className="font-bold text-gray-900">Activity Level</h3>
                </div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Activity level">
                  {ACTIVITY.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={activity === option.value}
                      onClick={() => setActivity(option.value)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        activity === option.value ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimum Orders */}
              <div>
                <label htmlFor={ids.min} className="block text-sm font-semibold text-gray-700 mb-2">
                  Minimum Orders
                </label>
                <input
                  id={ids.min}
                  type="number"
                  min="0"
                  value={minOrders}
                  onChange={(e) => setMinOrders(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Channel (added: a campaign needs a delivery channel) */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="size-5 text-gray-700" />
                  <h3 className="font-bold text-gray-900">Channel</h3>
                </div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Channel">
                  {CHANNELS.map(({ value, label, icon: Icon }) => {
                    const on = options.data?.channels[value];
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={channel === value}
                        onClick={() => setChannel(value)}
                        className={cn(
                          "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
                          channel === value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                        )}
                      >
                        <Icon className="size-4" />
                        {label}
                        {options.data && !on && (
                          <span
                            className={cn(
                              "text-xs font-normal",
                              channel === value ? "text-blue-100" : "text-gray-400",
                            )}
                          >
                            · not connected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {options.data && !connected && (
                  <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    The {channelLabel} provider isn&apos;t configured yet — sending will queue recipients without delivering.
                  </p>
                )}
              </div>

              {/* Message (added) */}
              {channel === "email" && (
                <div>
                  <label htmlFor={ids.subject} className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Subject <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={ids.subject}
                    type="text"
                    placeholder="e.g., New electronics just landed"
                    value={subject}
                    maxLength={150}
                    onChange={(e) => setSubject(e.target.value)}
                    aria-invalid={errors.subject ? true : undefined}
                    className={cn(inputCls, errors.subject && "border-red-400")}
                  />
                  {fieldError("subject")}
                </div>
              )}
              <div>
                <label htmlFor={ids.message} className="block text-sm font-semibold text-gray-700 mb-2">
                  Message <span className="text-red-600">*</span>
                </label>
                <textarea
                  id={ids.message}
                  rows={4}
                  placeholder="Hi {name}, ..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-invalid={errors.message ? true : undefined}
                  aria-describedby={`${ids.message}-hint`}
                  className={cn(inputCls, errors.message && "border-red-400")}
                />
                {errors.message ? (
                  fieldError("message")
                ) : (
                  <p id={`${ids.message}-hint`} className="text-xs text-gray-500 mt-1 flex justify-between gap-2">
                    <span>
                      Use <code className="bg-gray-100 px-1 rounded">{"{name}"}</code> for the customer&apos;s first name.
                    </span>
                    {channel === "sms" && <span className="shrink-0">{message.length} chars</span>}
                  </p>
                )}
              </div>

              {/* Estimated Reach */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4" aria-live="polite">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Users className="size-6 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-600 flex items-center gap-2">
                      Estimated Reach
                      {estimating && <Loader2 className="size-3.5 animate-spin text-blue-600" aria-label="Updating" />}
                    </p>
                    {estimate.isError && !estimate.data ? (
                      <p className="text-sm text-red-600">
                        {errorText(estimate.error)}{" "}
                        <button type="button" className="underline" onClick={() => estimate.refetch()}>
                          Retry
                        </button>
                      </p>
                    ) : estimate.data ? (
                      <>
                        <p className="text-2xl font-bold text-gray-900">
                          {total.toLocaleString()} {total === 1 ? "user" : "users"}
                        </p>
                        <p className="text-sm text-gray-600">
                          {reachable.toLocaleString()} reachable by {channelLabel}
                          {reachable < total && ` · ${(total - reachable).toLocaleString()} without ${channel === "email" ? "an email" : "a phone number"}`}
                        </p>
                      </>
                    ) : (
                      <Skeleton className="h-8 w-28 mt-1" />
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-end gap-3">
          {result ? (
            <>
              <button
                type="button"
                onClick={reset}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
              >
                New Campaign
              </button>
              {canSend && (result.status === "draft" || result.status === "not_sent") && (
                <Button variant="secondary" className="px-6" disabled={busy} onClick={() => setConfirming(true)}>
                  <Send className="size-4" />
                  {result.status === "draft" ? "Send Now" : "Retry Send"}
                </Button>
              )}
              <Button className="px-6" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
              >
                Cancel
              </button>
              {canCreate && (
                <Button
                  variant="secondary"
                  className="px-6"
                  loading={save.isPending}
                  disabled={busy || !options.data}
                  onClick={() => validate() && save.mutate(undefined)}
                >
                  {!save.isPending && <Save className="size-4" />}
                  Save as Draft
                </Button>
              )}
              {canSend && (
                <Button
                  className="px-6"
                  disabled={busy || !name.trim() || !options.data || estimate.data?.total === 0}
                  title={estimate.data?.total === 0 ? "No customers match this audience" : undefined}
                  onClick={() => validate() && setConfirming(true)}
                >
                  <Send className="size-4" />
                  Send Campaign
                </Button>
              )}
            </>
          )}
        </div>

        <ConfirmDialog
          open={confirming}
          title="Send campaign"
          confirmLabel="Send Campaign"
          pending={send.isPending}
          onConfirm={() => send.mutate(undefined)}
          onClose={() => !send.isPending && setConfirming(false)}
          message={
            <div className="space-y-2">
              <p>
                Send <span className="font-semibold">“{input.name}”</span> by {channelLabel} to{" "}
                <span className="font-semibold">{total.toLocaleString()}</span> matching customers
                {reachable < total && ` (${reachable.toLocaleString()} have ${channel === "email" ? "an email" : "a phone number"})`}?
              </p>
              {!connected && (
                <p className="text-sm text-amber-700">
                  {channelLabel} isn&apos;t connected: recipients will be queued but nothing is delivered until it is configured.
                </p>
              )}
              <p className="text-xs text-gray-500">The audience is re-checked when the campaign is sent.</p>
            </div>
          }
        />
      </div>
    </div>
  );
}
