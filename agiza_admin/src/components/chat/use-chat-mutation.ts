"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useApiMutation } from "@/hooks/use-api-mutation";
import { chatKeys, type Conversation } from "@/lib/api/services/chat";

/**
 * A conversation action (take over, assign, escalate, ...). The returned
 * conversation replaces the cached one; its thread, the list and the
 * counters are refreshed (actions add system events to the thread).
 */
export function useConversationMutation<V>(
  conversationId: number,
  fn: (vars: V) => Promise<Conversation>,
  opts: { success?: string | ((c: Conversation) => string); onSuccess?: (c: Conversation) => void; onError?: (e: unknown) => void } = {},
) {
  const qc = useQueryClient();
  return useApiMutation(fn, {
    invalidate: [chatKeys.messages(conversationId), chatKeys.lists, chatKeys.stats],
    success: opts.success,
    onError: opts.onError,
    onSuccess: (c) => {
      qc.setQueryData(chatKeys.one(c.id), c);
      opts.onSuccess?.(c);
    },
  });
}
