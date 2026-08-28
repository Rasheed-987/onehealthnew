"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  HEARTBEAT_MS,
  REALTIME_PATH,
  type ServerEvent,
} from "@/lib/realtime/events";

interface RealtimeState {
  /** False while falling back to polling. */
  connected: boolean;
  /** The reader's own User id, from the server. Null until the socket is up. */
  userId: string | null;
  /** Subscribe to incoming realtime server events. Returns unsubscribe cleanup function. */
  subscribe: (listener: (event: ServerEvent) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeState>({
  connected: false,
  userId: null,
  subscribe: () => () => {},
});

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}

/** 1s, 2s, 4s… capped. Reset the moment a connection succeeds. */
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const socket = useRef<WebSocket | null>(null);
  const myUserId = useRef<string | null>(null);
  const retry = useRef(RETRY_BASE_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const closed = useRef(false);
  const listeners = useRef<Set<(event: ServerEvent) => void>>(new Set());

  const subscribe = useMemo(
    () => (listener: (event: ServerEvent) => void) => {
      listeners.current.add(listener);
      return () => {
        listeners.current.delete(listener);
      };
    },
    [],
  );

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
          return;
        }
        if (parsed.type === "ready") {
          myUserId.current = parsed.userId;
          setUserId(parsed.userId);
        }
        listeners.current.forEach((cb) => {
          try {
            cb(parsed);
          } catch (e) {
            console.error("Realtime listener error:", e);
          }
        });
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeat.current) clearInterval(heartbeat.current);
        heartbeat.current = null;
        socket.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {};
    }

    connect();

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
      if (socket.current) {
        const ws = socket.current;
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }
      socket.current = null;
      setConnected(false);
    };
  }, []);

  const value = useMemo(
    () => ({ connected, userId, subscribe }),
    [connected, userId, subscribe],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

