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

/** A guardian link as the form submits it. */
export const GuardianInputSchema = z.object({
  parent: z.string().min(1, "Choose a parent."),
  relationship: z
    .enum(GUARDIAN_RELATIONSHIP)
    .default(GUARDIAN_RELATIONSHIP.GUARDIAN),
});

/**
 * Rejects the same parent listed twice before it reaches Mongo, so the caller
 * gets a field-level message instead of a schema validation error.
 */
const guardiansField = z
  .array(GuardianInputSchema)
  .default([])
  .refine(
    (list) => new Set(list.map((g) => g.parent)).size === list.length,
    "The same parent cannot be listed twice.",
  );

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
