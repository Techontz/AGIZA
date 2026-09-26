"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { inputClass } from "@/components/ui/form";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { settingsApi, settingsKeys, type ChannelStatus, type QuickReply } from "@/lib/api/services/settings";
import { cn } from "@/lib/cn";

const TIKTOK_NOTE = "TikTok doesn't offer outbound messaging for this account — reply in the TikTok app.";
const CHANNELS: { key: keyof ChannelStatus; label: string; env: string }[] = [
  { key: "whatsapp", label: "WhatsApp", env: "WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID" },
  { key: "facebook", label: "Facebook Messenger", env: "FACEBOOK_PAGE_TOKEN" },
  { key: "tiktok", label: "TikTok", env: "" },
  { key: "sms", label: "SMS", env: "SMS_AT_USERNAME and SMS_AT_API_KEY" },
  { key: "email", label: "Email", env: "EMAIL_HOST and the SMTP credentials" },
];

function QuickReplyRow({
  reply,
  canManage,
  onDelete,
}: {
  reply: QuickReply;
  canManage: boolean;
  onDelete: (r: QuickReply) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply.text);
  const [order, setOrder] = useState(String(reply.sort_order));
  const [error, setError] = useState<string | null>(null);

  const update = useApiMutation(
    (data: Partial<Pick<QuickReply, "text" | "sort_order" | "is_active">>) => settingsApi.quickReplies.update(reply.id, data),
    {
      invalidate: [settingsKeys.quickReplies],
      success: "Quick reply saved",
      onSuccess: () => {
        setEditing(false);
        setError(null);
      },
      onError: (e) => setError(errorText(e)),
    },
  );

  if (editing) {
    const valid = text.trim().length > 0 && /^\d+$/.test(order);
    return (
      <li className="border border-blue-200 bg-blue-50/40 rounded-lg p-3">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) update.mutate({ text: text.trim(), sort_order: Number(order) });
          }}
        >
          <input
            aria-label="Quick reply text"
            className={cn(inputClass, "flex-1")}
            value={text}
            maxLength={255}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
          <input
            aria-label="Sort order"
            type="number"
            min={0}
            className={cn(inputClass, "sm:w-24")}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={update.isPending} disabled={!valid}>
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(false);
                setText(reply.text);
                setOrder(String(reply.sort_order));
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
        {error && (
          <p className="text-xs text-red-600 mt-2" role="alert">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li
      className={cn(
        "border rounded-lg px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        reply.is_active ? "border-gray-300 bg-white" : "border-gray-200 bg-gray-50",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-medium text-gray-400 w-6 shrink-0 tabular-nums" title="Sort order">
          #{reply.sort_order}
        </span>
        <p className={cn("text-sm break-words", reply.is_active ? "text-gray-900" : "text-gray-500")}>{reply.text}</p>
        {!reply.is_active && (
          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">Hidden</span>
        )}
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium inline-flex items-center gap-1"
          >
            <Pencil className="size-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={() => update.mutate({ is_active: !reply.is_active })}
            disabled={update.isPending}
            className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors font-medium disabled:opacity-60"
          >
            {reply.is_active ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(reply)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            aria-label={`Delete quick reply “${reply.text}”`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </li>
  );
}

/** Chat configuration: canned replies for agents and which messaging channels are connected. */
export function ChatSettingsCard({ canView, canManage }: { canView: boolean; canManage: boolean }) {
  const replies = useQuery({ queryKey: settingsKeys.quickReplies, queryFn: settingsApi.quickReplies.list, enabled: canView });
  const channels = useQuery({ queryKey: settingsKeys.channels, queryFn: settingsApi.channels, enabled: canView });
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<QuickReply | null>(null);

  const list = replies.data ?? [];
  const nextOrder = list.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;

  const create = useApiMutation(() => settingsApi.quickReplies.create({ text: draft.trim(), sort_order: nextOrder, is_active: true }), {
    invalidate: [settingsKeys.quickReplies],
    success: "Quick reply added",
    onSuccess: () => {
      setDraft("");
      setAddError(null);
    },
    onError: (e) => setAddError(errorText(e)),
  });
  const remove = useApiMutation((r: QuickReply) => settingsApi.quickReplies.remove(r.id), {
    invalidate: [settingsKeys.quickReplies],
    success: "Quick reply deleted",
    onSuccess: () => setDeleting(null),
  });

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-green-100 p-2 rounded-lg">
          <MessageSquare className="size-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Chat Quick Replies &amp; Channels</h2>
          <p className="text-sm text-gray-600">Canned answers for support agents and messaging channel status</p>
        </div>
      </div>

      {!canView ? (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          Your role doesn&apos;t include Chat &amp; Customer Support, so these settings aren&apos;t shown.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2" aria-labelledby="quick-replies-heading">
            <h3 id="quick-replies-heading" className="font-bold text-gray-900 mb-3">
              Quick Replies
            </h3>

            {canManage && (
              <form
                className="mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) create.mutate(undefined);
                }}
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label="New quick reply"
                    className={cn(inputClass, "flex-1")}
                    placeholder="e.g. Thank you! Your order is on its way."
                    value={draft}
                    maxLength={255}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button type="submit" loading={create.isPending} disabled={!draft.trim()}>
                    {!create.isPending && <Plus className="size-5" />}
                    Add Reply
                  </Button>
                </div>
                {addError && (
                  <p className="text-xs text-red-600 mt-1" role="alert">
                    {addError}
                  </p>
                )}
              </form>
            )}

            {replies.isLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading quick replies">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : replies.isError ? (
              <ErrorState bare message={errorText(replies.error)} onRetry={() => replies.refetch()} />
            ) : list.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center">
                <MessageSquare className="size-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No quick replies yet</p>
                <p className="text-sm text-gray-500 mt-1">Agents see these as one-tap answers in the chat composer.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map((r) => (
                  <QuickReplyRow key={`${r.id}:${r.text}:${r.sort_order}`} reply={r} canManage={canManage} onDelete={setDeleting} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="channels-heading">
            <h3 id="channels-heading" className="font-bold text-gray-900 mb-3">
              Messaging Channels
            </h3>
            {channels.isLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading channels">
                {CHANNELS.map((c) => (
                  <Skeleton key={c.key} className="h-14 w-full" />
                ))}
              </div>
            ) : channels.isError ? (
              channels.error instanceof ApiError && channels.error.status === 403 ? (
                <p className="text-sm text-gray-600">You don&apos;t have access to view channel status.</p>
              ) : (
                <ErrorState bare message={errorText(channels.error)} onRetry={() => channels.refetch()} />
              )
            ) : (
              <ul className="space-y-2">
                {CHANNELS.map((c) => {
                  const connected = Boolean(channels.data?.[c.key]);
                  return (
                    <li key={c.key} className="border border-gray-200 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-gray-900">{c.label}</span>
                        {connected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle2 className="size-3.5" /> Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            <CircleSlash className="size-3.5" /> {c.key === "tiktok" ? "Inbound only" : "Not configured"}
                          </span>
                        )}
                      </div>
                      {!connected && (
                        <p className="text-xs text-gray-500 mt-1">
                          {c.env ? `Not configured — set ${c.env} in the server environment.` : TIKTOK_NOTE}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete quick reply"
        tone="danger"
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => !remove.isPending && setDeleting(null)}
        message={deleting && <>Delete “{deleting.text}”? Agents will no longer see it. To keep it for later, hide it instead.</>}
      />
    </Card>
  );
}
