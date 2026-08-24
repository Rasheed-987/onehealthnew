import { z } from "zod";
import { Types } from "mongoose";

import { TEACHER_TITLE, USER_STATUS } from "@/models/enums";
import type { IClassroom, ITeacher, IUser } from "@/models";

/**
 * Shapes shared by the teacher routes and the screens that call them, so the
 * form, the handler and the table cannot drift apart.
 */

/**
 * Create: "" means the admin left the box alone, so there is nothing to store.
 */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/**
 * Update: "" and "absent" must stay distinguishable.
 *
 * PATCH applies only the keys it was sent, so collapsing "" to undefined the
 * way `optionalText` does would make clearing a field impossible - the handler
 * cannot tell "erase the employee number" from "this form had no such input".
 * Here undefined means leave it alone and "" means unset it.
 */
const clearableText = z.string().trim().optional();

export const CreateTeacherSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  phone: optionalText,
  title: z.enum(TEACHER_TITLE).default(TEACHER_TITLE.MS),
  employeeId: optionalText,
  specialization: optionalText,
  joinedAt: optionalText,
});
export type CreateTeacherInput = z.infer<typeof CreateTeacherSchema>;

/** Every field optional - PATCH applies only what was sent. */
export const UpdateTeacherSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").optional(),
  lastName: z.string().trim().min(1, "Last name is required.").optional(),
  phone: clearableText,
  title: z.enum(TEACHER_TITLE).optional(),
  employeeId: clearableText,
  specialization: clearableText,
  joinedAt: clearableText,
  isActive: z.boolean().optional(),
  /* ACTIVE or SUSPENDED only - INVITED is set by creation, not by an edit. */
  status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.SUSPENDED]).optional(),
});

/** What the table renders. Flattened, so the client never walks a populated doc. */
export interface TeacherRow {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** "Ms. Amal Hassan" - the form the UI shows in a list. */
  displayName: string;
  phone: string | null;
  title: string;
  employeeId: string | null;
  specialization: string | null;
  joinedAt: string | null;
  isActive: boolean;
  status: string;
  /** True while the teacher is still on a password an admin set for them. */
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  classrooms: { id: string; name: string; role: string }[];
}

/** A Teacher document with `user` populated. */
type PopulatedTeacher = Omit<ITeacher, "user"> & { user: IUser | null };

export function toTeacherRow(
  teacher: PopulatedTeacher,
  classrooms: IClassroom[] = [],
): TeacherRow {
  const user = teacher.user;
  const first = user?.firstName ?? "";
  const last = user?.lastName ?? "";
  const fullName = `${first} ${last}`.trim();

  return {
    id: String(teacher._id),
    userId: user ? String(user._id) : "",
    email: user?.email ?? "",
    firstName: first,
    lastName: last,
    fullName,
    displayName: `${teacher.title} ${fullName}`.trim(),
    phone: user?.phone ?? null,
    title: teacher.title,
    employeeId: teacher.employeeId ?? null,
    specialization: teacher.specialization ?? null,
    joinedAt: teacher.joinedAt ? teacher.joinedAt.toISOString() : null,
    isActive: teacher.isActive,
    status: user?.status ?? USER_STATUS.SUSPENDED,
    mustChangePassword: user?.mustChangePassword ?? false,
    lastLoginAt: user?.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    classrooms: classrooms
      .filter((room) =>
        room.teachers.some((t) => String(t.teacher) === String(teacher._id)),
      )
      .map((room) => ({
        id: String(room._id),
        name: room.name,
        role:
          room.teachers.find((t) => String(t.teacher) === String(teacher._id))
            ?.role ?? "",
      })),
  };
}

/** 400 rather than a CastError 500 when someone puts junk in the URL. */
export function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value) && String(new Types.ObjectId(value)) === value;
}

/**
 * Escapes a user-supplied search string before it becomes a RegExp.
 *
 * Without this, typing "(" into the search box throws, and a pattern like
 * ".*" would scan every document.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
