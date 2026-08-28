"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useRealtime } from "./RealtimeProvider";

const UNREAD_POLL_MS = 60_000;

export function useUnreadCount(enabled = true): number {
  const { connected, subscribe } = useRealtime();
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    async function loadCount() {
      try {
        const payload = await fetchJson<{ count: number }>(
          "/api/messages/unread-count",
        );
        if (active) setCount(payload.count);
      } catch {
        // Swallowed: last known count is better than crash
      }
    }

    loadCount();

    const unsubscribe = subscribe((event) => {
      if (event.type === "message:new" || event.type === "thread:read") {
        void loadCount();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled, connected, subscribe]);

  return count;
}
