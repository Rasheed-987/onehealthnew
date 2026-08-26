import { z } from "zod";

import {
  ADDITIONAL_SYMPTOM,
  ADDITIONAL_SYMPTOM_LABEL,
  FLU_SYMPTOM,
  FLU_SYMPTOM_LABEL,
  GRADE_LEVEL_LABEL,
  NURSING_CARE,
  NURSING_CARE_LABEL,
  OTHER_SYMPTOM,
  OTHER_SYMPTOM_LABEL,
  VISIT_OUTCOME,
  VISIT_OUTCOME_LABEL,
  type AdditionalSymptom,
  type FluSymptom,
  type NursingCare,
  type OtherSymptom,
  type VisitOutcome,
} from "@/models/enums";
import { Classroom, Student, User, startOfDayUTC } from "@/models";
import type {
  IClassroom,
  IClinicalVisit,
  IStudent,
  IUser,
} from "@/models";

/**
 * Shapes shared by the clinical-visit routes and the screens that call them.
 *
 * This module touches Mongoose (`hydrateVisitRows` below), so a client
 * component may import from it with `import type` only - a value import drags
 * the driver into the browser bundle and fails the build on `async_hooks`. The
 * label maps a screen needs live in `@/models/enums`, which is free of it.
 */

/** Create semantics: "" is the same as not filling the box in. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/**
 * Update semantics, as stated in `students.ts`: `undefined` means leave the
 * field alone, `""` means clear it. So this one must NOT collapse "" away.
 */
const clearableText = z.string().trim().optional();

/** A checkbox group cannot tick the same box twice - mirrors the model hook. */
function uniqueList<T extends z.ZodType>(schema: T, message: string) {
  return z
    .array(schema)
    .refine((list) => new Set(list).size === list.length, message);
}

const FluSymptomsSchema = uniqueList(
  z.enum(FLU_SYMPTOM),
  "The same flu symptom cannot be recorded twice.",
);
const OtherSymptomsSchema = uniqueList(
  z.enum(OTHER_SYMPTOM),
  "The same symptom cannot be recorded twice.",
);
const AdditionalSymptomsSchema = uniqueList(
  z.enum(ADDITIONAL_SYMPTOM),
  "The same symptom cannot be recorded twice.",
);
const NursingCareSchema = uniqueList(
  z.enum(NURSING_CARE),
  "The same care cannot be recorded twice.",
);

/**
 * A moment, not a day. `datetime-local` sends "2026-08-25T15:58" with no zone,
 * which `Date.parse` reads as local time - correct here, because the nurse
 * means the clock on the wall.
 */
const VisitedAtSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a real date and time.")
  .refine(
    (value) => Date.parse(value) <= Date.now(),
    "A visit cannot be recorded for the future.",
  );

/**
 * Recording a visit. Only the child and the outcome are required: a child sent
 * home with nothing ticked is a real, if unhelpful, record, but a visit that
 * did not end is not.
 */
export const CreateVisitSchema = z.object({
  student: z.string().min(1, "Choose a child."),
  /** Absent means now - the nurse is usually writing this up as it happens. */
  visitedAt: VisitedAtSchema.optional(),
  fluSymptoms: FluSymptomsSchema.default([]),
  fluSymptomsOther: optionalText,
  otherSymptoms: OtherSymptomsSchema.default([]),
  additionalSymptoms: AdditionalSymptomsSchema.default([]),
  additionalSymptomsOther: optionalText,
  nursingCare: NursingCareSchema.default([]),
  careNotes: optionalText,
  outcome: z.enum(VISIT_OUTCOME, { error: "Choose how the visit ended." }),
  notes: optionalText,
});
export type CreateVisitInput = z.infer<typeof CreateVisitSchema>;

/**
 * Correcting a visit. Every field optional, and `student` is absent on purpose:
 * moving a record to a different child is not an edit, it is a delete and a
 * re-entry - and it would strand the derived `classroom`.
 */
export const UpdateVisitSchema = z.object({
  visitedAt: VisitedAtSchema.optional(),
  fluSymptoms: FluSymptomsSchema.optional(),
  fluSymptomsOther: clearableText,
  otherSymptoms: OtherSymptomsSchema.optional(),
  additionalSymptoms: AdditionalSymptomsSchema.optional(),
  additionalSymptomsOther: clearableText,
  nursingCare: NursingCareSchema.optional(),
  careNotes: clearableText,
  outcome: z.enum(VISIT_OUTCOME).optional(),
  notes: clearableText,
});
export type UpdateVisitInput = z.infer<typeof UpdateVisitSchema>;

/**
 * A `visitedAt` filter from an optional range.
 *
 * NOT `dayRangeFilter` from `attendance.ts`, which is the trap sitting next
 * door. That one ends the range at `$lte: startOfDayUTC(to)`, which is right
 * for a column already normalised to midnight and silently wrong here: a visit
 * at 15:58 on the `to` day is greater than that day's midnight, so the whole
 * last day of every range would vanish. The end is exclusive, one day on.
 */
export function visitRangeFilter(
  from?: string,
  to?: string,
): Record<string, Date> | undefined {
  const filter: Record<string, Date> = {};
  if (from) filter.$gte = startOfDayUTC(from);
  if (to) {
    const end = startOfDayUTC(to);
    end.setUTCDate(end.getUTCDate() + 1);
    filter.$lt = end;
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

/** One visit, serialised: ids as strings, dates as ISO, `undefined` as null. */
export interface ClinicalVisitRow {
  id: string;
  visitedAt: string;
  fluSymptoms: FluSymptom[];
  fluSymptomLabels: string[];
  fluSymptomsOther: string | null;
  otherSymptoms: OtherSymptom[];
  otherSymptomLabels: string[];
  additionalSymptoms: AdditionalSymptom[];
  additionalSymptomLabels: string[];
  additionalSymptomsOther: string | null;
  nursingCare: NursingCare[];
  nursingCareLabels: string[];
  careNotes: string | null;
  outcome: VisitOutcome;
  outcomeLabel: string;
  notes: string | null;
  /** `medicalNotes` rides along so the health record can flag an allergy. */
  student: {
    id: string;
    fullName: string;
    nationality: string | null;
    medicalNotes: string | null;
  };
  /** The room as it was on the day, not the room the child is in now. */
  classroom: { id: string; name: string; gradeLabel: string } | null;
  recordedBy: { id: string; name: string } | null;
  updatedAt: string;
}

export function toClinicalVisitRow(
  visit: IClinicalVisit,
  students: Map<string, IStudent>,
  classrooms: Map<string, IClassroom>,
  users: Map<string, IUser>,
): ClinicalVisitRow {
  const student = students.get(String(visit.student));
  const classroom = classrooms.get(String(visit.classroom));
  const user = users.get(String(visit.recordedBy));

  const fluSymptoms = visit.fluSymptoms ?? [];
  const otherSymptoms = visit.otherSymptoms ?? [];
  const additionalSymptoms = visit.additionalSymptoms ?? [];
  const nursingCare = visit.nursingCare ?? [];

  return {
    id: String(visit._id),
    visitedAt: visit.visitedAt.toISOString(),
    fluSymptoms,
    fluSymptomLabels: fluSymptoms.map((s) => FLU_SYMPTOM_LABEL[s]),
    fluSymptomsOther: visit.fluSymptomsOther ?? null,
    otherSymptoms,
    otherSymptomLabels: otherSymptoms.map((s) => OTHER_SYMPTOM_LABEL[s]),
    additionalSymptoms,
    additionalSymptomLabels: additionalSymptoms.map(
      (s) => ADDITIONAL_SYMPTOM_LABEL[s],
    ),
    additionalSymptomsOther: visit.additionalSymptomsOther ?? null,
    nursingCare,
    nursingCareLabels: nursingCare.map((c) => NURSING_CARE_LABEL[c]),
    careNotes: visit.careNotes ?? null,
    outcome: visit.outcome,
    outcomeLabel: VISIT_OUTCOME_LABEL[visit.outcome],
    notes: visit.notes ?? null,
    student: {
      id: String(visit.student),
      fullName: student
        ? `${student.firstName} ${student.lastName}`.trim()
        : "Unknown",
      nationality: student?.nationality ?? null,
      medicalNotes: student?.medicalNotes ?? null,
    },
    classroom: classroom
      ? {
          id: String(classroom._id),
          name: classroom.name,
          gradeLabel: GRADE_LEVEL_LABEL[classroom.gradeLevel],
        }
      : null,
    recordedBy: user
      ? {
          id: String(visit.recordedBy),
          name: `${user.firstName} ${user.lastName}`.trim(),
        }
      : null,
    updatedAt: visit.updatedAt.toISOString(),
  };
}

/**
 * Fills in the names a visit refers to by id.
 *
 * Three `$in` lookups rather than `populate`, because one child with a rough
 * term accounts for many of the rows on screen - populate would refetch that
 * same child, room and nurse once per visit.
 */
export async function hydrateClinicalVisitRows(
  visits: IClinicalVisit[],
): Promise<ClinicalVisitRow[]> {
  if (visits.length === 0) return [];

  const ids = <T,>(values: T[]) => Array.from(new Set(values.map(String)));

  const [students, classrooms, users] = await Promise.all([
    Student.find({ _id: { $in: ids(visits.map((v) => v.student)) } }),
    Classroom.find({ _id: { $in: ids(visits.map((v) => v.classroom)) } }),
    User.find({ _id: { $in: ids(visits.map((v) => v.recordedBy)) } }),
  ]);

  const byId = <T extends { _id: unknown }>(docs: T[]) =>
    new Map(docs.map((d) => [String(d._id), d]));

  return visits.map((visit) =>
    toClinicalVisitRow(
      visit,
      byId(students) as Map<string, IStudent>,
      byId(classrooms) as Map<string, IClassroom>,
      byId(users) as Map<string, IUser>,
    ),
  );
}

export interface VisitSummary {
  total: number;
  /** Distinct children, not visits - one child seen three times counts once. */
  children: number;
  sentHome: number;
  /** The two outcomes that mean a child left the school's care unwell. */
  escalated: number;
}

export function summariseVisits(
  rows: readonly ClinicalVisitRow[],
): VisitSummary {
  const count = (outcome: VisitOutcome) =>
    rows.filter((r) => r.outcome === outcome).length;

  return {
    total: rows.length,
    children: new Set(rows.map((r) => r.student.id)).size,
    sentHome: count(VISIT_OUTCOME.SENT_HOME),
    escalated:
      count(VISIT_OUTCOME.NURSERY_CLINIC) +
      count(VISIT_OUTCOME.AMBULANCE_TO_HOSPITAL),
  };
}
