"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { queryKeys, type ThreadPayload } from "@/hooks/queries";
import {
  HEARTBEAT_MS,
  REALTIME_PATH,
  type ServerEvent,
} from "@/lib/realtime/events";
import type { MessageThreadRow, ThreadReadReceipt } from "@/lib/messages";

/**
 * One socket per tab, and the cache patches it drives.
 *
 * This replaces three polling intervals - the open conversation every eight
 * seconds, the inbox every thirty, the badge every minute - with a connection
 * that is silent until something actually happens. What it does *not* replace
 * is the REST routes: the socket only says what changed, and the cache is
 * patched or refetched from the same endpoints as before.
 *
 * That split is deliberate. It means a socket that never connects - a
 * serverless host, a proxy that strips upgrades, a captive network - costs
 * nothing but freshness: `connected` stays false, the queries keep their
 * intervals, and the screen behaves exactly as it did before any of this.
 * Nothing here is load-bearing for correctness.
 */

interface RealtimeState {
  /** False while falling back to polling. */
  connected: boolean;
  /** The reader's own User id, from the server. Null until the socket is up. */
  userId: string | null;
}

const RealtimeContext = createContext<RealtimeState>({
  connected: false,
  userId: null,
});

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

/** 1s, 2s, 4s… capped. Reset the moment a connection succeeds. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  /*
   * The socket and its timers live in refs, not state: nothing renders from
   * them, and putting them in state would tear the connection down and rebuild
   * it on every unrelated re-render.
   */
  const socket = useRef<WebSocket | null>(null);
  /*
   * The reader's own id, mirrored out of state. `applyEvent` runs inside a
   * cache updater and cannot wait for a render to have happened since `ready`
   * arrived, so it reads the ref rather than the state.
   */
  const myUserId = useRef<string | null>(null);
  const retry = useRef(RETRY_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;

    function clearTimers() {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeat.current) clearInterval(heartbeat.current);
      reconnectTimer.current = null;
      heartbeat.current = null;
    }

    function scheduleReconnect() {
      if (closed.current || reconnectTimer.current) return;
      const delay = retry.current;
      retry.current = Math.min(delay * 2, RETRY_MAX_MS);
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, delay);
    }

    function connect() {
      if (closed.current) return;
      if (socket.current && socket.current.readyState <= WebSocket.OPEN) return;

      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${scheme}//${window.location.host}${REALTIME_PATH}`);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.current = ws;

      ws.onopen = () => {
        retry.current = RETRY_BASE_MS;
        setConnected(true);

        /*
         * Anything that happened while the socket was down was missed - there
         * is no replay buffer, by design. Re-reading on connect is the whole
         * of the catch-up story, and it is why a dropped connection is a
         * freshness problem rather than a correctness one.
         */
        void queryClient.invalidateQueries({
          queryKey: queryKeys.messages.all,
        });

        // Keeps intermediaries from timing out an idle upgrade.
        heartbeat.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        let parsed: ServerEvent;
        try {
          parsed = JSON.parse(String(event.data)) as ServerEvent;
        } catch {
          return; // Not ours, or truncated. Nothing to do.
        }
        if (parsed.type === "ready") {
          myUserId.current = parsed.userId;
          setUserId(parsed.userId);
          return;
        }
        applyEvent(queryClient, parsed, myUserId.current);
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeat.current) clearInterval(heartbeat.current);
        heartbeat.current = null;
        socket.current = null;
        scheduleReconnect();
      };

      // `onerror` is always followed by `onclose`, which is where the retry is
      // scheduled - handling it here as well would double the backoff.
      ws.onerror = () => {};
    }

    connect();

    /*
     * A socket can die without the browser noticing - a sleeping laptop, a
     * phone changing network. Coming back to the tab, or back online, is the
     * moment that matters, so both are treated as a reason to check.
     */
    const wake = () => {
      if (document.hidden) return;
      if (!socket.current || socket.current.readyState > WebSocket.OPEN) {
        retry.current = RETRY_BASE_MS;
        connect();
      }
    };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      closed.current = true;
      clearTimers();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      socket.current?.close();
      socket.current = null;
      setConnected(false);
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({ connected, userId }),
    [connected, userId],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Turns one event into cache writes.
 *
 * The rule applied throughout: patch what is cheap and certain, refetch what is
 * fiddly. A transcript is an append, so it is patched - that is the update
 * whose latency anyone actually feels. An inbox line carries an unread count
 * computed by an aggregation over read positions, so it is invalidated and the
 * server answers it, rather than being re-derived here from a message and
 * getting it subtly wrong.
 */
function applyEvent(
  queryClient: QueryClient,
  event: ServerEvent,
  viewerId: string | null,
): void {
  if (event.type === "message:new") {
    const key = queryKeys.messages.thread(event.threadId);

    queryClient.setQueryData<ThreadPayload>(key, (current) => {
      if (!current) return current; // Not open, and not worth fetching for.
      if (current.messages.some((m) => m.id === event.message.id)) {
        return current; // The optimistic append on send beat the echo here.
      }
      /*
       * `mine` is the one field a broadcast cannot carry - it is answered
       * differently for each reader - so it is decided here against the id the
       * server handed this connection on `ready`.
       */
      return {
        ...current,
        messages: [
          ...current.messages,
          { ...event.message, mine: event.message.sender.id === viewerId },
        ],
      };
    });

    void queryClient.invalidateQueries({ queryKey: queryKeys.messages.threads });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.messages.unreadCount,
    });
    return;
  }

  if (event.type === "thread:read") {
    const receipt: ThreadReadReceipt = {
      id: event.reader.id,
      label: event.reader.label,
      at: event.at,
    };

    // The open conversation: this is what flips "Sent" to "Seen".
    queryClient.setQueryData<ThreadPayload>(
      queryKeys.messages.thread(event.threadId),
      (current) =>
        current?.thread
          ? { ...current, thread: withReceipt(current.thread, receipt) }
          : current,
    );

    // And the inbox line, so the tick is right there too without a refetch.
    queryClient.setQueryData<{ threads: MessageThreadRow[] }>(
      queryKeys.messages.threads,
      (current) =>
        current && {
          threads: current.threads.map((t) =>
            t.id === event.threadId ? withReceipt(t, receipt) : t,
          ),
        },
    );
  }
}

/** One reader's position, replacing any older one for the same person. */
function withReceipt(
  thread: MessageThreadRow,
  receipt: ThreadReadReceipt,
): MessageThreadRow {
  const others = thread.readReceipts.filter((r) => r.id !== receipt.id);
  return {
    ...thread,
    readReceipts: [receipt, ...others].sort((a, b) => b.at.localeCompare(a.at)),
  };
}
