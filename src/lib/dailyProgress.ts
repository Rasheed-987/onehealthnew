import { z } from "zod";

import { DayKeySchema } from "@/lib/attendance";
import {
  MOOD,
  MOOD_LABEL,
  SUPPLY_NEED,
  SUPPLY_NEED_LABEL,
  TIME_OF_DAY_PATTERN,
  TOILET_TYPE,
  TOILET_TYPE_LABEL,
  type Mood,
  type SupplyNeed,
  type ToiletType,
} from "@/models/enums";
import { Classroom, Student, User, toDayKey } from "@/models";
import type {
  IClassroom,
  IDailyProgress,
  IStudent,
  IUser,
} from "@/models";

/**
 * Shapes shared by the daily-sheet routes and the screens that call them.
 *
 * The validation here deliberately restates the four rules already written as
 * a `pre("validate")` hook on the DailyProgress model. That is not an
 * oversight: `{ student, date }` is unique, so saving a sheet has to be an
 * upsert, and Mongoose document middleware does not run on `findOneAndUpdate`.
 * If the rules lived only on the model, every write from the teacher's phone
 * would skip them. The four are:
 *
 *   1. the same mood cannot be ticked twice
 *   2. the same supply cannot be requested twice
 *   3. a nap with an end time needs a start time, and cannot end before it starts
 *   4. blank `fun` bullets are dropped, not rejected
 *
 * Every rule above is *section-local* - none of them relates one section to
 * another. That is what makes the partial-section write in
 * `buildProgressUpdate` safe: validating only the sections that arrived is
 * complete, not partial. Attendance could not do this, because its
 * `status` <-> `checkInAt` rule spans two fields.
 */

const timeOfDay = z
  .string()
  .trim()
  .regex(TIME_OF_DAY_PATTERN, "Use a 24-hour time such as 08:50.");

/** One drink, e.g. 09:00 milk. */
export const DrinkEntrySchema = z
  .object({
    at: timeOfDay.optional(),
    what: z
      .string()
      .trim()
      .max(60, "Keep the drink under 60 characters.")
      .optional(),
  })
  /*
   * Not a model rule. The schema makes both fields optional, so `{}` is a
   * legal drink - and renders as a blank line in the guardian's feed for ever.
   * Rejecting it at the edge costs nothing.
   */
  .refine(
    (drink) => Boolean(drink.at || drink.what),
    "A drink needs a time or a description.",
  );

/** One nappy change or toilet visit. */
export const ToiletEntrySchema = z.object({
  at: timeOfDay.optional(),
  type: z.enum(TOILET_TYPE),
});

/** One nap. Model rule 3. */
export const NapEntrySchema = z
  .object({
    from: timeOfDay.optional(),
    to: timeOfDay.optional(),
  })
  .superRefine((nap, ctx) => {
    if (nap.to && !nap.from) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "A nap that has an end time needs a start time.",
      });
    }
    // "HH:mm" is zero-padded, so a plain string compare orders correctly. A
    // nap running past midnight is not a thing at a nursery.
    if (nap.from && nap.to && nap.to < nap.from) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "A nap cannot end before it starts.",
      });
    }
  });

/** Model rules 1 and 2 - a checkbox group cannot tick the same box twice. */
const MoodsSchema = z
  .array(z.enum(MOOD))
  .refine(
    (list) => new Set(list).size === list.length,
    "The same mood cannot be recorded twice.",
  );

const NeedsSchema = z
  .array(z.enum(SUPPLY_NEED))
  .refine(
    (list) => new Set(list).size === list.length,
    "The same supply cannot be requested twice.",
  );

/**
 * Model rule 4 - blank bullets come from an empty row left in the form, so
 * they are dropped rather than failing the whole sheet.
 */
const FunSchema = z
  .array(z.string().max(200, "Keep each line under 200 characters."))
  .max(20, "That is more bullets than the form has room for.")
  .transform((lines) => lines.map((line) => line.trim()).filter(Boolean));

/** The six sections, in the order they appear on the paper form. */
export const PROGRESS_SECTIONS = [
  "drinks",
  "moods",
  "toilet",
  "fun",
  "naps",
  "needs",
] as const;

/**
 * Saving a sheet: one child, one day, whichever sections the teacher touched.
 *
 * Every section is `.optional()`, and that optionality IS the contract:
 * absent means "leave this section alone", present means "replace it
 * wholesale", `[]` means "clear it". A teacher adding a 10:30 nappy change at
 * lunchtime sends only `toilet`, and the morning's drinks survive.
 *
 * Note `.optional()` comes last on `fun`: putting it before the transform
 * would run the transform on `undefined` and destroy the absent/present
 * distinction the whole design rests on.
 */
export const SaveProgressSchema = z.object({
  student: z.string().min(1, "Choose a child."),
  date: DayKeySchema,

  drinks: z
    .array(DrinkEntrySchema)
    .max(20, "That is a lot of drinks for one day.")
    .optional(),
  moods: MoodsSchema.optional(),
  toilet: z
    .array(ToiletEntrySchema)
    .max(20, "That is a lot of changes for one day.")
    .optional(),
  fun: FunSchema.optional(),
  naps: z.array(NapEntrySchema).max(6, "That is a lot of naps.").optional(),
  needs: NeedsSchema.optional(),

  /** Clearable: absent leaves it alone, `""` clears it. */
  notes: z
    .string()
    .trim()
    .max(1000, "Keep the note under 1000 characters.")
    .optional(),
});
export type SaveProgressInput = z.infer<typeof SaveProgressSchema>;

/**
 * Turns a partial sheet into a Mongo update touching only the keys that
 * arrived.
 *
 * This is where the partial-replace semantics actually live. Two teachers
 * editing the same child at 10:30 - one adding a nappy change, one adding a
 * drink - both land, because neither update mentions the other's field. A
 * full-document overwrite would have the second save carry a stale copy of the
 * first's section and silently wipe it.
 *
 * The honest limit: WITHIN one section it is still last-writer-wins. Two
 * teachers both adding a drink in the same window will lose one. Fixing that
 * needs `$push` with per-line ids the model does not have, and `$push` cannot
 * express "correct the 09:00 milk to 09:15" - which is the commoner action.
 *
 * `student` and `date` are deliberately absent: on upsert Mongo takes them
 * from the filter.
 */
export function buildProgressUpdate(
  input: SaveProgressInput,
  context: { classroom: unknown; recordedBy: string },
): { $set: Record<string, unknown>; $unset?: Record<string, ""> } {
  const set: Record<string, unknown> = {
    classroom: context.classroom,
    recordedBy: context.recordedBy,
  };
  const unset: Record<string, ""> = {};

  for (const key of PROGRESS_SECTIONS) {
    if (input[key] !== undefined) set[key] = input[key];
  }

  // `$unset` rather than `$set: ""` so a note nobody wrote and a note somebody
  // deliberately cleared are the same absent field, not two different states.
  if (input.notes !== undefined) {
    if (input.notes === "") unset.notes = "";
    else set.notes = input.notes;
  }

  return Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set };
}

/** `napMinutes("12:30", "14:00")` -> 90. No Date involved. */
export function napMinutes(from?: string, to?: string): number | null {
  if (!from || !to) return null;
  const minutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  return minutes(to) - minutes(from);
}

export interface DailyProgressRow {
  id: string;
  /** "2025-05-16". */
  date: string;
  drinks: { at: string | null; what: string | null }[];
  moods: Mood[];
  moodLabels: string[];
  toilet: { at: string | null; type: ToiletType; typeLabel: string }[];
  fun: string[];
  naps: { from: string | null; to: string | null; minutes: number | null }[];
  needs: SupplyNeed[];
  needLabels: string[];
  notes: string | null;
  student: { id: string; fullName: string };
  /** The room as it was on the day, not the room the child is in now. */
  classroom: { id: string; name: string } | null;
  /** The last staff member to save the sheet, not necessarily the first. */
  recordedBy: { id: string; name: string } | null;
  /** No section filled and no note - the sheet exists but is untouched. */
  isEmpty: boolean;
  updatedAt: string;
}

export function toProgressRow(
  record: IDailyProgress,
  students: Map<string, IStudent>,
  classrooms: Map<string, IClassroom>,
  users: Map<string, IUser>,
): DailyProgressRow {
  const student = students.get(String(record.student));
  const classroom = classrooms.get(String(record.classroom));
  const user = users.get(String(record.recordedBy));

  const drinks = (record.drinks ?? []).map((d) => ({
    at: d.at ?? null,
    what: d.what ?? null,
  }));
  const toilet = (record.toilet ?? []).map((t) => ({
    at: t.at ?? null,
    type: t.type,
    typeLabel: TOILET_TYPE_LABEL[t.type],
  }));
  const naps = (record.naps ?? []).map((n) => ({
    from: n.from ?? null,
    to: n.to ?? null,
    minutes: napMinutes(n.from, n.to),
  }));
  const moods = record.moods ?? [];
  const needs = record.needs ?? [];
  const fun = record.fun ?? [];

  return {
    id: String(record._id),
    date: toDayKey(record.date),
    drinks,
    moods,
    moodLabels: moods.map((m) => MOOD_LABEL[m]),
    toilet,
    fun,
    naps,
    needs,
    needLabels: needs.map((n) => SUPPLY_NEED_LABEL[n]),
    notes: record.notes ?? null,
    student: {
      id: String(record.student),
      fullName: student
        ? `${student.firstName} ${student.lastName}`.trim()
        : "Unknown",
    },
    classroom: classroom
      ? { id: String(classroom._id), name: classroom.name }
      : null,
    recordedBy: user
      ? {
          id: String(record.recordedBy),
          name: `${user.firstName} ${user.lastName}`.trim(),
        }
      : null,
    isEmpty:
      drinks.length === 0 &&
      moods.length === 0 &&
      toilet.length === 0 &&
      fun.length === 0 &&
      naps.length === 0 &&
      needs.length === 0 &&
      !record.notes,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Fills in the names a sheet refers to by id.
 *
 * Three `$in` lookups rather than `populate`, because the same student and the
 * same classroom recur on nearly every row of a month of sheets - populate
 * would refetch them per row.
 */
export async function hydrateProgressRows(
  records: IDailyProgress[],
): Promise<DailyProgressRow[]> {
  if (records.length === 0) return [];

  const ids = <T,>(values: T[]) => Array.from(new Set(values.map(String)));

  const [students, classrooms, users] = await Promise.all([
    Student.find({ _id: { $in: ids(records.map((r) => r.student)) } }),
    Classroom.find({ _id: { $in: ids(records.map((r) => r.classroom)) } }),
    User.find({ _id: { $in: ids(records.map((r) => r.recordedBy)) } }),
  ]);

  const byId = <T extends { _id: unknown }>(docs: T[]) =>
    new Map(docs.map((d) => [String(d._id), d]));

  return records.map((record) =>
    toProgressRow(
      record,
      byId(students) as Map<string, IStudent>,
      byId(classrooms) as Map<string, IClassroom>,
      byId(users) as Map<string, IUser>,
    ),
  );
}

export interface ProgressSummary {
  /** Sheets that exist for the day. */
  total: number;
  /** Sheets with something actually recorded on them. */
  started: number;
  untouched: number;
  drinks: number;
  toiletChanges: number;
  naps: number;
  napMinutes: number;
  /** Children with at least one supply need. */
  needing: number;
}

export function summariseProgress(
  rows: readonly DailyProgressRow[],
): ProgressSummary {
  const started = rows.filter((r) => !r.isEmpty).length;
  const sum = (pick: (row: DailyProgressRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  return {
    total: rows.length,
    started,
    untouched: rows.length - started,
    drinks: sum((r) => r.drinks.length),
    toiletChanges: sum((r) => r.toilet.length),
    naps: sum((r) => r.naps.length),
    napMinutes: sum((r) =>
      r.naps.reduce((mins, nap) => mins + (nap.minutes ?? 0), 0),
    ),
    needing: rows.filter((r) => r.needs.length > 0).length,
  };
}

/**
 * The checkbox groups, so a screen never hardcodes an enum and drifts from the
 * model when a mood is added.
 */
export const PROGRESS_OPTIONS = {
  moods: Object.values(MOOD).map((value) => ({
    value,
    label: MOOD_LABEL[value],
  })),
  toiletTypes: Object.values(TOILET_TYPE).map((value) => ({
    value,
    label: TOILET_TYPE_LABEL[value],
  })),
  needs: Object.values(SUPPLY_NEED).map((value) => ({
    value,
    label: SUPPLY_NEED_LABEL[value],
  })),
} as const;
