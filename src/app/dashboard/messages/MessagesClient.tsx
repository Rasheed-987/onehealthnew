"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "@/components/dashboard/RealtimeProvider";
import { errorMessage, fetchJson } from "@/lib/fetchJson";
import type {
  MessageRow,
  MessageThreadRow,
  ThreadReadReceipt,
} from "@/lib/messages";
import { NewThreadModal } from "./NewThreadModal";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";

const THREAD_POLL_MS = 8_000;
const LIST_POLL_MS = 30_000;

interface ThreadPayload {
  thread: MessageThreadRow | null;
  messages: MessageRow[];
}

export function MessagesClient({ canSend }: { canSend: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Threads List State
  const [threads, setThreads] = useState<MessageThreadRow[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  // Selected Thread State
  const [thread, setThread] = useState<MessageThreadRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadErrorState, setThreadErrorState] = useState<string | null>(null);

  const { connected, userId, subscribe } = useRealtime();

  const messagesRef = useRef<MessageRow[]>([]);
  messagesRef.current = messages;

  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // ---------------------------------------------------------------------------
  // Fetch Inbox Threads List
  // ---------------------------------------------------------------------------
  const fetchThreads = useCallback(async () => {
    try {
      const data = await fetchJson<{ threads: MessageThreadRow[] }>(
        "/api/messages/threads",
      );
      setThreads(data.threads);
      setThreadsError(null);
    } catch (err) {
      setThreadsError(errorMessage(err, "Could not load your conversations."));
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  // ---------------------------------------------------------------------------
  // Fetch Selected Thread Transcript
  // ---------------------------------------------------------------------------
  const fetchMessages = useCallback(
    async (id: string, isInitial = false) => {
      if (isInitial) {
        setThreadLoading(true);
        setThreadErrorState(null);
      }

      const held = messagesRef.current;
      const after = !isInitial ? held.at(-1)?.createdAt : undefined;

      try {
        const payload = await fetchJson<ThreadPayload>(
          `/api/messages/threads/${id}` +
            (after ? `?after=${encodeURIComponent(after)}` : ""),
        );

        setThread(payload.thread);
        setThreadErrorState(null);

        if (isInitial || !after) {
          setMessages(payload.messages);
        } else if (payload.messages.length > 0) {
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            const fresh = payload.messages.filter((m) => !known.has(m.id));
            return fresh.length === 0 ? prev : [...prev, ...fresh];
          });
        }
      } catch (err) {
        setThreadErrorState(
          errorMessage(err, "Could not load this conversation."),
        );
      } finally {
        if (isInitial) setThreadLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      setMessages([]);
      setThreadErrorState(null);
      return;
    }
    void fetchMessages(selectedId, true);
  }, [selectedId, fetchMessages]);

  // ---------------------------------------------------------------------------
  // Realtime Push Event Handling via Subscription
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "message:new") {
        void fetchThreads();

        if (event.threadId === selectedIdRef.current) {
          const newMsg: MessageRow = {
            ...event.message,
            mine: event.message.sender.id === userId,
          };
          setMessages((prev) =>
            prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg],
          );
        }
      } else if (event.type === "thread:read") {
        const receipt: ThreadReadReceipt = {
          id: event.reader.id,
          label: event.reader.label,
          at: event.at,
        };

        if (event.threadId === selectedIdRef.current) {
          setThread((prev) =>
            prev
              ? {
                  ...prev,
                  readReceipts: [
                    receipt,
                    ...prev.readReceipts.filter((r) => r.id !== receipt.id),
                  ].sort((a, b) => b.at.localeCompare(a.at)),
                }
              : prev,
          );
        }

        setThreads((prev) =>
          prev.map((t) =>
            t.id === event.threadId
              ? {
                  ...t,
                  readReceipts: [
                    receipt,
                    ...t.readReceipts.filter((r) => r.id !== receipt.id),
                  ].sort((a, b) => b.at.localeCompare(a.at)),
                }
              : t,
          ),
        );
      }
    });

    return () => unsubscribe();
  }, [subscribe, userId, fetchThreads]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setSendError(null);
  }, []);

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

        const message: MessageRow | undefined = payload.data?.message ?? payload.message;
        if (message) {
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message],
          );
        }
        setSendError(null);
        void fetchThreads();
        return true;
      } catch {
        return false;
      }
    },
    [selectedId, fetchThreads],
  );

  const combinedThreadError = sendError ?? threadErrorState;

  return (
    <>
      <div className="flex h-[calc(100dvh-15rem)] min-h-[26rem] gap-4">
        <ThreadList
          threads={threads}
          selectedId={selectedId}
          onSelect={select}
          loading={threadsLoading}
          error={threadsError}
          canSend={canSend}
          onNew={() => setPickerOpen(true)}
          className={`w-full shrink-0 lg:flex lg:w-80 ${
            selectedId ? "hidden" : "flex"
          }`}
        />

        <ThreadView
          key={selectedId ?? "none"}
          thread={thread}
          messages={messages}
          loading={selectedId !== null && threadLoading}
          error={combinedThreadError}
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
            void fetchThreads();
          }}
        />
      )}
    </>
  );
}
