/**
 * Day keys for the records that happen once per child per day.
 *
 * Attendance and DailyProgress both need "one row per student per day", which
 * only works as a unique index if every write lands on the exact same instant.
 * `startOfDayUTC` is used as a Mongoose setter on those `date` paths so a
 * request that posts `2025-05-16T09:14:22+04:00` and one that posts
 * `2025-05-16` are stored identically and collide as intended.
 */
export function startOfDayUTC(value: Date | string | number): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return d;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** `2025-05-16` - the form the admin tables render and filter on. */
export function toDayKey(value: Date): string {
  return startOfDayUTC(value).toISOString().slice(0, 10);
}
