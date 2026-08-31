import { z } from "zod";

import { ENROLLMENT_STATUS, GENDER, GUARDIAN_RELATIONSHIP } from "@/models/enums";
import type { IClassroom, IEnrollment, IParent, IStudent, IUser } from "@/models";

/**
 * Shapes shared by the student routes and the screens that call them.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/** Update: undefined = leave alone, "" = clear. See the note in teachers.ts. */
const clearableText = z.string().trim().optional();

const relationshipField = z
  .enum(GUARDIAN_RELATIONSHIP)
  .default(GUARDIAN_RELATIONSHIP.GUARDIAN);

/** A guardian who already has an account, picked from the search. */
export const ExistingGuardianSchema = z.object({
  kind: z.literal("existing"),
  parent: z.string().min(1, "Choose a parent."),
  relationship: relationshipField,
});

/**
 * A guardian typed straight onto the enrolment sheet.
 *
 * The account does not exist yet - `POST /api/students` creates the User and
 * Parent alongside the child, in one transaction, and invites them after it
 * commits. Email is the identity, so it is the one field that cannot be blank.
 */
export const NewGuardianSchema = z.object({
  kind: z.literal("new"),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: optionalText,
  relationship: relationshipField,
});

/**
 * Either half of the enrolment sheet's guardian row.
 *
 * The `preprocess` keeps the older payload shape working: a bare
 * `{ parent, relationship }` predates the union and is still what the current
 * student form sends, so it is read as `kind: "existing"` rather than being
 * rejected. New callers send `kind` explicitly.
 */
export const GuardianInputSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !("kind" in value)) {
    return { ...value, kind: "parent" in value ? "existing" : "new" };
  }
  return value;
}, z.discriminatedUnion("kind", [ExistingGuardianSchema, NewGuardianSchema]));

export type GuardianInput = z.infer<typeof GuardianInputSchema>;

/**
 * Rejects the same guardian listed twice before it reaches Mongo, so the caller
 * gets a field-level message instead of a schema validation error.
 *
 * Two identities to check, not one: an existing guardian collides by parent id,
 * a new one by email. A sheet naming the same person once from the search and
 * once by hand would otherwise create a second account for them and then fail
 * the model's own duplicate check with a much worse message.
 */
const guardiansField = z
  .array(GuardianInputSchema)
  .default([])
  .refine((list) => {
    const keys = list.map((g) =>
      g.kind === "existing" ? `id:${g.parent}` : `email:${g.email}`,
    );
    return new Set(keys).size === keys.length;
  }, "The same guardian cannot be listed twice.");

/*
 * Guardians used to be required on creation, on the reasoning that a child with
 * nobody attached is unreachable. That was true when staff typing them in was
 * the only way a guardian could ever be linked.
 *
 * It stopped being true when guardians gained the ability to register in the
 * app against a student ID: the school enrols the child, hands the family the
 * ID, and the family attaches themselves. Every enrolment on that path starts
 * with an empty list by design, so demanding one here would have forced staff
 * to invent a placeholder guardian purely to get past the form.
 *
 * The concern behind the old rule has not gone away - it is now carried by the
 * red "No guardian" flag on the students table, which turns a hard block into a
 * visible piece of outstanding work.
 */

/** "2022-04-01". Rejected if it is not a real date, or is in the future. */
const dateOfBirth = z
  .string()
  .trim()
  .min(1, "Date of birth is required.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.")
  .refine(
    (value) => Date.parse(value) <= Date.now(),
    "Date of birth cannot be in the future.",
  );

export const CreateStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  dateOfBirth,
  /**
   * The school's admission number. Optional here even though it is unique,
   * because most children already on the system have none and the enrolment
   * sheet must not start demanding one retrospectively.
   */
  studentId: optionalText,
  gender: z.enum(GENDER),
  nationality: optionalText,
  medicalNotes: optionalText,
  guardians: guardiansField,
});
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;

export const UpdateStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").optional(),
  lastName: z.string().trim().min(1, "Last name is required.").optional(),
  dateOfBirth: dateOfBirth.optional(),
  studentId: clearableText,
  gender: z.enum(GENDER).optional(),
  nationality: clearableText,
  medicalNotes: clearableText,
  isActive: z.boolean().optional(),
  /** Sent whole - the form always submits the complete guardian list. */
  guardians: guardiansField.optional(),
});

export interface StudentGuardianRow {
  parentId: string;
  name: string;
  email: string;
  phone: string | null;
  relationship: string;
}

export interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** The admission number staff read out to a guardian. Null if never set. */
  studentId: string | null;
  dateOfBirth: string;
  age: number;
  gender: string;
  nationality: string | null;
  medicalNotes: string | null;
  isActive: boolean;
  guardians: StudentGuardianRow[];
  /** The room the child sits in right now, if any. */
  classroom: { id: string; name: string } | null;
}

type PopulatedParent = Omit<IParent, "user"> & { user: IUser | null };

/** Whole years between a date of birth and today. Mirrors the model virtual. */
export function ageFrom(dob: Date): number {
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())
  ) {
    years -= 1;
  }
  return Math.max(0, years);
}

export function toStudentRow(
  student: IStudent,
  parents: PopulatedParent[] = [],
  enrollments: IEnrollment[] = [],
  classrooms: IClassroom[] = [],
): StudentRow {
  const byId = new Map(parents.map((p) => [String(p._id), p]));

  const seat = enrollments.find(
    (e) =>
      String(e.student) === String(student._id) &&
      e.status === ENROLLMENT_STATUS.ACTIVE,
  );
  const room = seat
    ? classrooms.find((c) => String(c._id) === String(seat.classroom))
    : undefined;

  return {
    id: String(student._id),
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: `${student.firstName} ${student.lastName}`.trim(),
    studentId: student.studentId ?? null,
    dateOfBirth: student.dateOfBirth.toISOString(),
    age: ageFrom(student.dateOfBirth),
    gender: student.gender,
    nationality: student.nationality ?? null,
    medicalNotes: student.medicalNotes ?? null,
    isActive: student.isActive,
    guardians: student.guardians.map((link) => {
      const parent = byId.get(String(link.parent));
      const user = parent?.user;
      return {
        parentId: String(link.parent),
        name: user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown",
        email: user?.email ?? "",
        phone: user?.phone ?? null,
        relationship: link.relationship,
      };
    }),
    classroom: room ? { id: String(room._id), name: room.name } : null,
  };
}
