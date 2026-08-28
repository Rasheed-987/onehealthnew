/**
 * "2024-12-24 05:43" - the format on the table.
 *
 * Its own module rather than a helper in `lib/feedback.ts`, because that one
 * reaches for the User model to hydrate rows, and a value import of it from a
 * client component would drag Mongoose into the browser bundle. The same
 * reason `formatVisitedAt` sits beside the health table instead of in
 * `lib/clinicalVisits.ts`.
 *
 * Sortable-looking on purpose: the column it fills is one a super admin scans
 * down, and `2025-05-05` lines up under `2024-12-24` in a way that
 * "5 May 2025" does not. Formatted on the client, because the server does not
 * know what timezone the reader is in and a server-rendered clock would
 * hydrate to a different string.
 */
export function formatSubmittedAt(iso: string): string {
  const at = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}`
  );
}
