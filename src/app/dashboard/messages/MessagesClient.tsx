"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePoll } from "@/components/dashboard/usePoll";
import { MESSAGES_READ_EVENT } from "@/components/dashboard/useUnreadCount";
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
 * There is no websocket. New messages arrive by polling, at three different
 * rates depending on how much the reader is likely to care: the open
 * conversation is checked every eight seconds and asks only for what it has not
 * already got, the inbox every thirty, and the sidebar badge every minute. All
 * three stop while the tab is in the background - see `usePoll`.
 */

const THREAD_POLL_MS = 8_000;
const LIST_POLL_MS = 30_000;

export function MessagesClient({ canSend }: { canSend: boolean }) {
  const [threads, setThreads] = useState<MessageThreadRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<MessageThreadRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);

  /*
   * The newest message this screen has seen, held in a ref rather than state so
   * the poll can read it without becoming a new closure - and therefore a new
   * interval - on every message that arrives.
   */
  const newestAt = useRef<string | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const response = await fetch("/api/messages/threads");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setListError(payload.error ?? "Could not load your conversations.");
        setThreads([]);
        return;
      }
      setListError(null);
      setThreads(payload.threads ?? []);
    } catch {
      setListError("Could not reach the server.");
    } finally {
      setListLoading(false);
    }
  }, []);

  // Deferred so the effect body does not setState synchronously.
  useEffect(() => {
    const timer = setTimeout(() => void loadThreads(), 0);
    return () => clearTimeout(timer);
  }, [loadThreads]);

  usePoll(loadThreads, LIST_POLL_MS);

  /** The full transcript. Runs when a conversation is opened. */
  const openThread = useCallback(async (id: string) => {
    setThreadLoading(true);
    setThreadError(null);
    newestAt.current = null;

    try {
      const response = await fetch(`/api/messages/threads/${id}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setThreadError(payload.error ?? "Could not load this conversation.");
        setThread(null);
        setMessages([]);
        return;
      }

      const rows: MessageRow[] = payload.messages ?? [];
      setThread(payload.thread ?? null);
      setMessages(rows);
      newestAt.current = rows.at(-1)?.createdAt ?? null;

      // Opening a conversation clears its unread, so the badge in the corner of
      // this very page should not go on claiming otherwise for another minute.
      window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      setThreads((current) =>
        current.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)),
      );
    } catch {
      setThreadError("Could not reach the server.");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  /*
   * Opening a conversation is an event, not a thing to synchronise: it happens
   * when someone clicks, and never on its own. So it hangs off the click rather
   * than off an effect watching `selectedId`.
   */
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id === null) {
        setThread(null);
        setMessages([]);
        newestAt.current = null;
        return;
      }
      void openThread(id);
    },
    [openThread],
  );

  /**
   * The live half. Asks only for messages newer than the last one on screen, so
   * a quiet conversation costs an empty array every eight seconds rather than
   * the whole transcript.
   */
  const pollThread = useCallback(async () => {
    const id = selectedId;
    if (!id) return;

    try {
      const params = newestAt.current
        ? `?after=${encodeURIComponent(newestAt.current)}`
        : "";
      const response = await fetch(`/api/messages/threads/${id}${params}`);
      if (!response.ok) return; // A failed poll is not a failed screen.

      const payload = await response.json().catch(() => ({}));
      const incoming: MessageRow[] = payload.messages ?? [];
      if (payload.thread) setThread(payload.thread);
      if (incoming.length === 0) return;

      setMessages((current) => {
        // The optimistic append on send can race the poll for the same message.
        const known = new Set(current.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        return fresh.length === 0 ? current : [...current, ...fresh];
      });
      newestAt.current = incoming.at(-1)?.createdAt ?? newestAt.current;

      window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      void loadThreads();
    } catch {
      // Offline. The next tick tries again.
    }
  }, [selectedId, loadThreads]);

  usePoll(pollThread, THREAD_POLL_MS, selectedId !== null);

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
          setThreadError(payload.error ?? "Could not send that message.");
          return false;
        }

        const message: MessageRow | undefined = payload.message;
        if (message) {
          setMessages((current) =>
            current.some((m) => m.id === message.id)
              ? current
              : [...current, message],
          );
          newestAt.current = message.createdAt;
        }
        setThreadError(null);
        void loadThreads();
        return true;
      } catch {
        return false;
      }
    },
    [selectedId, loadThreads],
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
          loading={listLoading}
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
          loading={threadLoading}
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
            void loadThreads();
          }}
        />
      )}
    </>
  );
}
