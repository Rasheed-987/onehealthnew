/**
 * Timestamps for a transcript.
 *
 * A conversation is read in relation to now - "was that this morning, or last
 * week?" - so the further back a message is, the coarser the stamp gets. The
 * exact moment is always available on the `title` attribute.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "14:32" today, "Mon 14:32" this past week, "16 May" beyond it. */
export function formatStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const now = new Date();
  const time = at.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (sameDay(at, now)) return time;

  if (now.getTime() - at.getTime() < 6 * DAY_MS) {
    const day = at.toLocaleDateString("en-GB", { weekday: "short" });
    return `${day} ${time}`;
  }

  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: at.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** The full moment, for a tooltip. */
export function formatFull(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The separator between days in the transcript. */
export function formatDayHeading(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";

  const now = new Date();
  if (sameDay(at, now)) return "Today";
  if (sameDay(at, new Date(now.getTime() - DAY_MS))) return "Yesterday";

  return at.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: at.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
