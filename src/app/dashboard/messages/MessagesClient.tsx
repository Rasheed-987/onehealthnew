"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  queryKeys,
  useMessageThreadsQuery,
  THREAD_POLL_MS,
  type ThreadPayload,
} from "@/hooks/queries";
import { useRealtime } from "@/components/dashboard/RealtimeProvider";
import { errorMessage, fetchJson } from "@/lib/fetchJson";
import type { MessageRow, MessageThreadRow } from "@/lib/messages";
import { NewThreadModal } from "./NewThreadModal";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";

/**
 * Messages.
 *
 * As everywhere else in the dashboard, no role branching here beyond which
 * controls render. `GET /api/messages/threads` scopes itself - every
 * conversation for an admin, their own for a teacher, and for a guardian the
 * ones about their own children - so this component draws the same two panes
 * whoever is looking at them.
 *
 * Messages arrive over the WebSocket opened by `RealtimeProvider`, which pushes
 * into this same React Query cache - so this component reads the cache and does
 * not know or care which mechanism filled it. While that socket is up the three
 * polling intervals are switched off entirely; if it cannot connect they come
 * back at their original rates and the screen behaves as it did before. That is
 * the whole of the fallback, and it is why nothing here branches on `connected`
 * beyond handing it to the queries.
 *
 * The `?after=` delta fetch is kept for exactly that fallback path, and for the
 * catch-up read on reconnect - it is what makes a dropped socket cost freshness
 * rather than messages.
 */

export function MessagesClient({ canSend }: { canSend: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { connected } = useRealtime();

  const threadsQuery = useMessageThreadsQuery(connected);
  const threads = threadsQuery.data?.threads ?? [];
  const listError = threadsQuery.isError
    ? errorMessage(threadsQuery.error, "Could not load your conversations.")
    : null;

  /**
   * The open conversation.
   *
   * Opening one fetches the transcript; every poll after that asks only for
   * messages newer than the last one held and appends them, so a quiet
   * conversation costs an empty array every eight seconds rather than the whole
   * history. The delta is folded into the cached value rather than kept in
   * component state, which is what lets a conversation opened again later paint
   * its transcript at once and then top itself up.
   */
  const threadQuery = useQuery({
    queryKey: queryKeys.messages.thread(selectedId ?? ""),
    enabled: selectedId !== null,
    queryFn: async (): Promise<ThreadPayload> => {
      const id = selectedId as string;
      const held = queryClient.getQueryData<ThreadPayload>(
        queryKeys.messages.thread(id),
      );
      const after = held?.messages.at(-1)?.createdAt;

      const payload = await fetchJson<ThreadPayload>(
        `/api/messages/threads/${id}` +
          (after ? `?after=${encodeURIComponent(after)}` : ""),
      );
      if (!held || !after) return payload;

      // The optimistic append on send can race the poll for the same message.
      const known = new Set(held.messages.map((m) => m.id));
      const fresh = payload.messages.filter((m) => !known.has(m.id));
      return {
        thread: payload.thread ?? held.thread,
        messages:
          fresh.length === 0 ? held.messages : [...held.messages, ...fresh],
      };
    },
    // Silent while the socket is up; it appends into this cache entry instead.
    refetchInterval: connected ? false : THREAD_POLL_MS,
    refetchIntervalInBackground: false,
    // A conversation someone has open is never fresh enough to skip.
    staleTime: 0,
  });

  const thread = threadQuery.data?.thread ?? null;
  const messages = threadQuery.data?.messages ?? [];
  const threadError =
    sendError ??
    (threadQuery.isError
      ? errorMessage(threadQuery.error, "Could not load this conversation.")
      : null);

  /*
   * Reading a conversation clears its unread, so neither the badge in the
   * corner of this very page nor the row in the list beside it should go on
   * claiming otherwise.
   *
   * The ref is what separates opening a thread from a message landing in one
   * already open. An arrival means the inbox previews are out of date as well;
   * an open does not, and refetching the list there would be a request for
   * nothing. (With the socket up, an arrival has usually already invalidated
   * the list - `invalidateQueries` on an in-flight key is deduped, so the
   * overlap costs nothing.)
   */
  const newestId = messages.at(-1)?.id ?? null;
  const lastSeen = useRef<{ threadId: string | null; messageId: string | null }>(
    { threadId: null, messageId: null },
  );

  useEffect(() => {
    if (!selectedId || newestId === null) return;

    const arrived =
      lastSeen.current.threadId === selectedId &&
      lastSeen.current.messageId !== newestId;
    lastSeen.current = { threadId: selectedId, messageId: newestId };

    queryClient.setQueryData<{ threads: MessageThreadRow[] }>(
      queryKeys.messages.threads,
      (current) =>
        current && {
          threads: current.threads.map((t) =>
            t.id === selectedId ? { ...t, unreadCount: 0 } : t,
          ),
        },
    );
    void queryClient.invalidateQueries({
      queryKey: queryKeys.messages.unreadCount,
    });
    if (arrived) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messages.threads,
      });
    }
  }, [selectedId, newestId, queryClient]);

  /*
   * Opening a conversation is an event, not a thing to synchronise: it happens
   * when someone clicks, and never on its own. Selecting only moves the id -
   * the query above follows it.
   */
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setSendError(null);
  }, []);

  /** Returns false so the composer can keep the draft when a send fails. */
  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!selectedId) return false;
      try {
        const response = await fetch(`/api/messages/threads/${selectedId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setSendError(payload.error ?? "Could not send that message.");
          return false;
        }

        /*
         * Written straight into the cache rather than waited for on the next
         * poll: the message is already in hand, and showing your own message
         * eight seconds after you sent it is the kind of lag a chat is judged
         * on. The poll dedupes it by id when it comes round.
         */
        const message: MessageRow | undefined = payload.message;
        if (message) {
          queryClient.setQueryData<ThreadPayload>(
            queryKeys.messages.thread(selectedId),
            (current) =>
              current &&
              (current.messages.some((m) => m.id === message.id)
                ? current
                : { ...current, messages: [...current.messages, message] }),
          );
        }
        setSendError(null);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.messages.threads,
        });
        return true;
      } catch {
        return false;
      }
    },
    [selectedId, queryClient],
  );

  return (
    <>
      {/* Two panes side by side from `lg` up. Below that the list and the
          conversation take turns, because neither is usable at half a phone. */}
      <div className="flex h-[calc(100dvh-15rem)] min-h-[26rem] gap-4">
        <ThreadList
          threads={threads}
          selectedId={selectedId}
          onSelect={select}
          loading={threadsQuery.isPending}
          error={listError}
          canSend={canSend}
          onNew={() => setPickerOpen(true)}
          className={`w-full shrink-0 lg:flex lg:w-80 ${
            selectedId ? "hidden" : "flex"
          }`}
        />

        {/* Keyed on the conversation, so switching threads remounts the view
            and its half-written draft goes with the thread it belonged to. */}
        <ThreadView
          key={selectedId ?? "none"}
          thread={thread}
          messages={messages}
          loading={selectedId !== null && threadQuery.isPending}
          error={threadError}
          canSend={canSend}
          onSend={send}
          onBack={() => select(null)}
          className={`min-w-0 flex-1 lg:flex ${selectedId ? "flex" : "hidden"}`}
        />
      </div>

      {pickerOpen && (
        <NewThreadModal
          open
          onClose={() => setPickerOpen(false)}
          onOpened={(threadId) => {
            setPickerOpen(false);
            select(threadId);
            void queryClient.invalidateQueries({
              queryKey: queryKeys.messages.threads,
            });
          }}
        />
      )}
    </>
  );
}
