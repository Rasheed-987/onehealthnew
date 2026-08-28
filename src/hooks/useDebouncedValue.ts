"use client";

import { useEffect, useState } from "react";

/**
 * The value, but only once it has stopped changing for `delayMs`.
 *
 * This is the debounce that used to sit around each screen's fetch, moved onto
 * the input instead. Debouncing the value rather than the request is what lets
 * the query key stay honest: typing holds the key still, and the moment it
 * settles React Query either has that key cached already or goes and gets it.
 *
 * The first value is returned as-is - a screen opening should not wait out a
 * delay meant for a keystroke that has not happened yet.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
