import {
  MOOD_LABEL,
  SUPPLY_NEED_LABEL,
  type Mood,
  type SupplyNeed,
} from "@/models/enums";
// Straight from `models/day`, NOT the `@/models` barrel: the barrel pulls in
// every Mongoose model, and this module is imported by a client component for
// `formatMinutes`, which would drag mongoose into the browser bundle and fail
// the build on `async_hooks`. Everything else here is types (erased) or enums.
import { startOfDayUTC, toDayKey } from "@/models/day";
import type { DailyProgressRow } from "@/lib/dailyProgress";

/**
 * The week-at-a-glance view.
 *
 * There is no WeeklyProgress model and there should not be one. A week is not
 * a thing a teacher fills in - it is seven daily sheets read together, and the
 * daily sheet is already the record of truth. A second collection would have
 * to be rewritten every time a sheet changed, and the moment one of those
 * writes was missed the two would disagree about the same week with no way to
 * tell which was right.
 *
 * So this module is arithmetic over `DailyProgressRow[]`, nothing more. It
 * touches the database not at all: the route fetches the week's sheets through
 * the same `resolveRecordScope` filter the daily list uses and hands them here.
 * That is what makes the roll-up inherit the scoping for free - there is no
 * second query with its own chance of forgetting who may see what.
 */

/** Monday-first, matching how a nursery week is actually spoken about. */
export const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

const DAY_MS = 86_400_000;

/**
 * The Monday of the week containing `value`, at UTC midnight.
 *
 * UTC throughout, because that is where `DailyProgress.date` lives - a local
 * week boundary would sit a few hours off and file Monday's sheets under the
 * previous week for anyone east of Greenwich.
 */
export function startOfWeekUTC(value: Date | string | number): Date {
  const day = startOfDayUTC(value);
  if (Number.isNaN(day.getTime())) return day;
  // getUTCDay is 0=Sunday..6=Saturday; +6 %7 re-bases it to 0=Monday, so
  // Sunday reads as day 6 and belongs to the week that began six days ago.
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY_MS);
}

/** The Sunday closing the week that `start` opens. */
export function endOfWeekUTC(start: Date): Date {
  return new Date(startOfWeekUTC(start).getTime() + 6 * DAY_MS);
}

/** The seven day keys of the week, Monday first. Always seven, never fewer. */
export function weekDayKeys(start: Date): string[] {
  const monday = startOfWeekUTC(start);
  return Array.from({ length: 7 }, (_, i) =>
    toDayKey(new Date(monday.getTime() + i * DAY_MS)),
  );
}

/** One square in a child's seven-day strip. */
export interface WeeklyDayCell {
  /** "2026-08-24". */
  date: string;
  /** "Mon". */
  weekday: string;
  /** null when no sheet was ever opened for this child on this day. */
  sheetId: string | null;
  /** A sheet exists AND something is written on it. */
  started: boolean;
  drinks: number;
  toilet: number;
  napMinutes: number;
  moods: Mood[];
  moodLabels: string[];
  needs: SupplyNeed[];
  fun: string[];
  notes: string | null;
}

export interface WeeklyChildRow {
  student: {
    id: string;
    fullName: string;
    age: number | null;
    photoUrl: string | null;
  };
  /**
   * The room named on the child's last sheet this week - not the room they
   * sit in today. A child who transferred on Wednesday reads as the room that
   * actually saw their week out.
   */
  classroom: { id: string; name: string } | null;
  /** Always seven, Monday first, whether or not a sheet exists for each. */
  days: WeeklyDayCell[];
  /** Days with something actually written on them. */
  daysRecorded: number;
  drinks: number;
  toiletChanges: number;
  napMinutes: number;
  /** Averaged over the days the child actually napped, not over seven. */
  averageNapMinutes: number | null;
  /** Every mood ticked this week, commonest first. */
  moodTally: { mood: Mood; label: string; count: number }[];
  /** The commonest mood of the week, or null if none was ever ticked. */
  topMood: { mood: Mood; label: string; count: number } | null;
  /** Supplies asked for, with the days each was asked on. */
  needs: { need: SupplyNeed; label: string; days: string[] }[];
  /** The `fun` bullets across the week, each tagged with its day. */
  highlights: { date: string; weekday: string; line: string }[];
  notes: { date: string; weekday: string; note: string }[];
}

/**
 * Folds a week of daily sheets into one row per child.
 *
 * `students` is the roster to report on and is passed in rather than derived
 * from the sheets, because the most useful thing this screen says is often
 * about a child who has NO sheets: "nobody wrote anything for Amity all week"
 * is invisible if the rows are built from the sheets that happen to exist.
 */
export function rollUpWeek(
  start: Date,
  students: readonly {
    id: string;
    fullName: string;
    age?: number | null;
    photoUrl?: string | null;
  }[],
  rows: readonly DailyProgressRow[],
): WeeklyChildRow[] {
  const keys = weekDayKeys(start);

  // One pass into `studentId|dayKey`, so the per-child loop below is a lookup
  // rather than a scan of every sheet in the week.
  const byStudentDay = new Map<string, DailyProgressRow>();
  for (const row of rows) {
    byStudentDay.set(`${row.student.id}|${row.date}`, row);
  }

  return students.map((student) => {
    const days: WeeklyDayCell[] = keys.map((date, index) => {
      const row = byStudentDay.get(`${student.id}|${date}`);
      const weekday = WEEKDAY_LABELS[index];

      if (!row) {
        return {
          date,
          weekday,
          sheetId: null,
          started: false,
          drinks: 0,
          toilet: 0,
          napMinutes: 0,
          moods: [],
          moodLabels: [],
          needs: [],
          fun: [],
          notes: null,
        };
      }

      return {
        date,
        weekday,
        sheetId: row.id,
        started: !row.isEmpty,
        drinks: row.drinks.length,
        toilet: row.toilet.length,
        napMinutes: row.naps.reduce(
          (total, nap) => total + (nap.minutes ?? 0),
          0,
        ),
        moods: row.moods,
        moodLabels: row.moodLabels,
        needs: row.needs,
        fun: row.fun,
        notes: row.notes,
      };
    });

    const moodCounts = new Map<Mood, number>();
    const needDays = new Map<SupplyNeed, string[]>();
    const highlights: WeeklyChildRow["highlights"] = [];
    const notes: WeeklyChildRow["notes"] = [];

    for (const day of days) {
      for (const mood of day.moods) {
        moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
      }
      for (const need of day.needs) {
        needDays.set(need, [...(needDays.get(need) ?? []), day.date]);
      }
      for (const line of day.fun) {
        highlights.push({ date: day.date, weekday: day.weekday, line });
      }
      if (day.notes) {
        notes.push({ date: day.date, weekday: day.weekday, note: day.notes });
      }
    }

    const moodTally = [...moodCounts.entries()]
      .map(([mood, count]) => ({ mood, label: MOOD_LABEL[mood], count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const napMinutes = days.reduce((total, day) => total + day.napMinutes, 0);
    const daysWithNap = days.filter((day) => day.napMinutes > 0).length;

    // The room on the last sheet of the week, so a mid-week transfer is
    // reported as the room that saw the child out rather than the one they
    // happened to start in.
    const lastRoom = [...days]
      .reverse()
      .map((day) => byStudentDay.get(`${student.id}|${day.date}`))
      .find((row) => row?.classroom)?.classroom;

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        age: student.age ?? null,
        photoUrl: student.photoUrl ?? null,
      },
      classroom: lastRoom ?? null,
      days,
      daysRecorded: days.filter((day) => day.started).length,
      drinks: days.reduce((total, day) => total + day.drinks, 0),
      toiletChanges: days.reduce((total, day) => total + day.toilet, 0),
      napMinutes,
      averageNapMinutes:
        daysWithNap > 0 ? Math.round(napMinutes / daysWithNap) : null,
      moodTally,
      topMood: moodTally[0] ?? null,
      needs: [...needDays.entries()]
        .map(([need, dayKeys]) => ({
          need,
          label: SUPPLY_NEED_LABEL[need],
          days: dayKeys,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      highlights,
      notes,
    };
  });
}

export interface WeeklySummary {
  /** Children on the roster this week. */
  children: number;
  /** Children with at least one day written on. */
  childrenRecorded: number;
  /** Children with nothing written all week - the number worth acting on. */
  untouched: number;
  /** Child-days written on, out of `children * 7`. */
  daysRecorded: number;
  drinks: number;
  toiletChanges: number;
  napMinutes: number;
  /** Children who asked for a supply at any point this week. */
  needing: number;
}

export function summariseWeek(rows: readonly WeeklyChildRow[]): WeeklySummary {
  const sum = (pick: (row: WeeklyChildRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  const recorded = rows.filter((row) => row.daysRecorded > 0).length;

  return {
    children: rows.length,
    childrenRecorded: recorded,
    untouched: rows.length - recorded,
    daysRecorded: sum((row) => row.daysRecorded),
    drinks: sum((row) => row.drinks),
    toiletChanges: sum((row) => row.toiletChanges),
    napMinutes: sum((row) => row.napMinutes),
    needing: rows.filter((row) => row.needs.length > 0).length,
  };
}

/** 90 -> "1h 30m", 45 -> "45m". Minutes alone stop reading past an hour. */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "25 Aug - 31 Aug 2026", for a header that has to fit on a phone. */
export function formatWeekRange(start: Date): string {
  const end = endOfWeekUTC(start);
  const day = (value: Date) =>
    value.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${day(startOfWeekUTC(start))} - ${day(end)} ${end.getUTCFullYear()}`;
}
