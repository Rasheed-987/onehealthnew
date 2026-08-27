"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` on an interval, but only while the tab is actually being
 * looked at.
 *
 * The visibility half is the point. A dashboard left open in a background tab
 * would otherwise keep asking the server for messages all night, and a phone
 * would keep waking its radio to do it. Coming back to the tab fires the
 * callback immediately rather than waiting out the remainder of an interval,
 * so a conversation is never a poll-length out of date at the moment someone
 * starts reading it.
 *
 * `callback` is held in a ref so a caller can pass a fresh closure on every
 * render - the usual case, since it almost always reads current state -
 * without tearing the timer down and restarting it each time.
 */
export function usePoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => void saved.current(), intervalMs);
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        void saved.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
