"use client";

import { useUnreadCountQuery } from "@/hooks/queries";
import { useRealtime } from "./RealtimeProvider";

/**
 * Unread message count for the sidebar badge.
 *
 * Pushed to over the socket, which is what a badge wants: it moves when a
 * message actually arrives rather than up to a minute later. With no socket it
 * falls back to the slow poll it always had. Reading a thread moves it either
 * way - the messages screen invalidates this query - so a number the reader has
 * just disproved never sits in the corner of the page they are looking at.
 *
 * That used to be a window event, dispatched by one component and listened for
 * by this one. It is the same cache entry on both sides now, which is the same
 * decoupling without a second mechanism to keep in step.
 *
 * Failures are swallowed: a badge that cannot load is not a page that failed,
 * and the last known number is better than a zero nobody can trust.
 */
export function useUnreadCount(enabled = true): number {
  const { connected } = useRealtime();
  return useUnreadCountQuery(enabled, connected).data?.count ?? 0;
}
