"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";

import { ConversationList } from "@/components/chat/conversation-list";
import { ConversationPane } from "@/components/chat/conversation-pane";
import { StartConversationModal } from "@/components/chat/start-modal";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { chatApi, chatKeys } from "@/lib/api/services/chat";
import { cn } from "@/lib/cn";
import { pageMeta } from "@/lib/nav";

const POLL_MS = 10_000;
const PAGE_SIZE = 30;

export function ChatView() {
  const meta = pageMeta["/chat"];
  const { data: me } = useMe();
  const canEdit = can(me, "chat", "edit");
  const [f, setF] = useUrlFilters({ open: "", channel: "all", search: "", view: "open", about: "all" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [starting, setStarting] = useState(false);

  const query = {
    view: f.view === "open" ? undefined : f.view,
    channel: f.channel,
    search: f.search,
    about: f.about === "all" ? undefined : f.about,
  };
  const list = useInfiniteQuery({
    queryKey: chatKeys.list(query),
    queryFn: ({ pageParam, signal }) => chatApi.list({ ...query, page: pageParam, page_size: PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  });
  const stats = useQuery({ queryKey: chatKeys.stats, queryFn: chatApi.stats, refetchInterval: 30_000 });
  const rows = list.data?.pages.flatMap((p) => p.results) ?? [];
  const openId = f.open ? Number(f.open) : null;
  const openRow = openId ? rows.find((r) => r.id === openId) : undefined;

  return (
    <div className="h-[calc(100dvh-73px)] min-h-[520px] flex flex-col bg-slate-50">
      <div className={cn("bg-white border-b border-slate-200 px-4 sm:px-6 py-4", openId && "hidden lg:block")}>
        <h1 className="text-slate-900">{meta.title}</h1>
        <p className="text-slate-600 mt-1 text-sm">{meta.description}</p>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <ConversationList
          className={cn("w-full lg:w-96 flex-shrink-0", openId ? "hidden lg:flex" : "flex")}
          rows={rows}
          loading={list.isPending}
          error={list.isError ? errorText(list.error) : null}
          onRetry={() => list.refetch()}
          selectedId={openId}
          onSelect={(id) => setF({ open: String(id) })}
          search={search}
          onSearch={setSearch}
          channel={f.channel}
          onChannel={(channel) => setF({ channel })}
          view={f.view}
          onView={(view) => setF({ view })}
          about={f.about}
          onAbout={(about) => setF({ about })}
          stats={stats.data}
          hasMore={Boolean(list.hasNextPage)}
          loadingMore={list.isFetchingNextPage}
          onLoadMore={() => list.fetchNextPage()}
          onNew={() => setStarting(true)}
          canEdit={canEdit}
        />

        <div className={cn("flex-1 min-w-0 min-h-0 flex-col", openId ? "flex" : "hidden lg:flex")}>
          {openId ? (
            <ConversationPane key={openId} id={openId} placeholder={openRow} me={me} onBack={() => setF({ open: "" })} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
              <div className="text-center">
                <MessageSquare className="size-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-slate-900 mb-2">No Conversation Selected</h3>
                <p className="text-slate-600 text-sm">Select a conversation from the left to start</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {starting && (
        <StartConversationModal
          open
          onClose={() => setStarting(false)}
          onStarted={(c) => {
            setStarting(false);
            setSearch("");
            setF({ open: String(c.id), view: "open", channel: "all", search: "", about: "all" });
          }}
        />
      )}
    </div>
  );
}
