"use client";

import { useState } from "react";

import { errorMessage } from "@/lib/fetchJson";

/**
 * A query's error as a dismissible banner.
 *
 * These screens all draw their failure in a box with an X on it, which was
 * simple when the message was a piece of state: dismissing set it to null.
 * Read from the cache it is derived, and there is nothing to null out - so
 * what gets recorded instead is the moment that was dismissed. A later failure
 * carries a newer timestamp and speaks up again, which is the difference
 * between dismissing a banner and silencing an error.
 *
 * Returns the message to show, or null, and the handler for the X.
 */
export function useDismissibleError(
  query: { isError: boolean; error: unknown; errorUpdatedAt: number },
  fallback: string,
): [string | null, () => void] {
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const message =
    query.isError && query.errorUpdatedAt !== dismissedAt
      ? errorMessage(query.error, fallback)
      : null;

  return [message, () => setDismissedAt(query.errorUpdatedAt)];
}
