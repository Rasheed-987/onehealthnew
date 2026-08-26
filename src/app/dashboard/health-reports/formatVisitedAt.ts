/**
 * "25 Aug 2026, 3:58 pm" in the browser's locale.
 *
 * Its own module rather than a helper in `lib/clinicalVisits.ts`, because that
 * one reaches for the Student and Classroom models to hydrate rows - a value
 * import of it from a client component would drag Mongoose into the browser
 * bundle and fail the build on `async_hooks`. The same reason `weeklyProgress`
 * gets away with exporting `formatMinutes` and this cannot.
 *
 * Formatted on the client on purpose: the server does not know what timezone
 * the nurse is in, so a server-rendered clock time would hydrate to a
 * different string.
 */
export function formatVisitedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
