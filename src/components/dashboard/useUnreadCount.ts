"use client";

import { useCallback, useEffect, useState } from "react";

import { usePoll } from "./usePoll";

/** Fired by the messages screen when it opens a thread and clears its unread. */
export const MESSAGES_READ_EVENT = "messages:read";

/**
 * Unread message count for the sidebar badge.
 *
 * Polled slowly - a badge is a nudge, not a notification, and every page in the
 * dashboard runs this. Reading a thread is the one thing that should move it
 * faster than the interval, so the messages screen fires a window event and
 * this refetches on the spot instead of leaving a stale number sitting in the
 * corner of the page the reader is already looking at.
 *
 * Failures are swallowed: a badge that cannot load is not a page that failed.
 */
export function useUnreadCount(pollMs = 60_000, enabled = true): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch("/api/messages/unread-count");
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({}));
      if (typeof payload.count === "number") setCount(payload.count);
    } catch {
      // Offline, or signed out. Leave the last known number alone.
    }
  }, [enabled]);

  // Deferred so the effect body does not setState synchronously.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const onRead = () => void load();
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, onRead);
  }, [load]);

  usePoll(load, pollMs, enabled);

  return count;
}
