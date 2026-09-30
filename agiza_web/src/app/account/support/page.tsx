"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { supportApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";
import { dateTime } from "@/lib/format";

export default function SupportPage() {
  const client = useQueryClient();
  const messages = useQuery({ queryKey: ["support"], queryFn: supportApi.messages, refetchInterval: 15_000 });
  const [body, setBody] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const send = useMutation({
    mutationFn: () => supportApi.send(body),
    onSuccess: () => {
      setBody("");
      client.invalidateQueries({ queryKey: ["support"] });
    },
  });
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.data]);
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-medium text-ink">Support</h1>
      <div className="flex h-[60vh] min-h-96 flex-col rounded-lg bg-surface shadow-card">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.isLoading ? (
            <Skeleton className="h-20" />
          ) : !messages.data?.messages.length ? (
            <p className="py-10 text-center text-muted">Ask us anything about an order, delivery or payment. The AGIZA team replies here.</p>
          ) : (
            messages.data.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : m.from === "system" ? "justify-center" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-lg px-3.5 py-2.5 text-[15px]", m.from === "me" ? "bg-ink text-white" : m.from === "system" ? "bg-canvas text-[13px] text-muted" : "bg-canvas text-ink")}>
                  {m.from === "agiza" && m.author ? <p className="mb-0.5 text-[12px] font-semibold text-primary">{m.author}</p> : null}
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={cn("mt-1 text-[11px]", m.from === "me" ? "text-white/75" : "text-muted")}>{dateTime(m.created_at)}</p>
                </div>
              </div>
            ))
          )}
          <div ref={end} />
        </div>
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate();
          }}
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="Type a message"
            aria-label="Message"
            className="h-11 flex-1 rounded-md border border-line px-3.5 text-[15px] focus:border-brand focus:outline-none"
          />
          <Button type="submit" loading={send.isPending} icon={<Send className="size-4" />} aria-label="Send">
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </div>
      {send.isError ? <Notice tone="danger">{errorMessage(send.error)}</Notice> : null}
    </div>
  );
}
