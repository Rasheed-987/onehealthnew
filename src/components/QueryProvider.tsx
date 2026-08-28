"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The one cache the whole dashboard reads through.
 *
 * What it buys is not a faster server - it is not asking the server again.
 * Every screen here fetched on mount and threw the answer away on unmount, so
 * paging back to a list you were just looking at meant sitting through the same
 * round trip a second time, and five different screens each fetched their own
 * copy of the classroom picker. Under one client those become cache reads.
 *
 * The defaults are chosen to keep the old behaviour visible rather than to be
 * clever:
 *
 * - `staleTime` of 30s means a screen you return to paints immediately from
 *   cache and refreshes behind the paint. Anything a mutation changes is
 *   invalidated explicitly, so this never shows an edit you just made as
 *   stale.
 * - `retry: 0` because the screens show their error the moment a request
 *   fails, and always did. Backing off three times first would only mean
 *   staring at a spinner for several seconds before being told you are
 *   offline.
 * - `refetchOnWindowFocus` is React Query's default and is the same rule
 *   `usePoll` enforced by hand: coming back to the tab is the moment the data
 *   on screen matters again.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 0,
        refetchOnWindowFocus: true,
      },
    },
  });
}

/*
 * One client per browser tab, but a fresh one per request on the server -
 * a module-level singleton there would leak one user's cache into the next
 * person's render.
 */
let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialiser, so a re-render never builds a second client and drops
  // the cache under the components reading it.
  const [client] = useState(getQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
