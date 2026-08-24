import { z } from "zod";

import { GUARDIAN_RELATIONSHIP, USER_STATUS } from "@/models/enums";
import type { IParent, IStudent, IUser } from "@/models";

/**
 * Shapes shared by the parent routes and the screens that call them.
 *
 * Mirrors `teachers.ts` deliberately: the two screens behave the same way, and
 * a reader who has understood one should not have to re-learn the other.
 */

/** Create: "" means the field was left blank, so there is nothing to store. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/**
 * Update: "" and absent must stay distinguishable, or clearing a field is
 * impossible. undefined = leave alone, "" = unset.
 */
const clearableText = z.string().trim().optional();

export const CreateParentSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  phone: optionalText,
  occupation: optionalText,
  address: optionalText,
  emergencyPhone: optionalText,
});
export type CreateParentInput = z.infer<typeof CreateParentSchema>;

export const UpdateParentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").optional(),
  lastName: z.string().trim().min(1, "Last name is required.").optional(),
  phone: clearableText,
  occupation: clearableText,
  address: clearableText,
  emergencyPhone: clearableText,
  /* ACTIVE or SUSPENDED only - INVITED is set by creation, not by an edit. */
  status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.SUSPENDED]).optional(),
});

export interface ParentChild {
  id: string;
  name: string;
  relationship: string;
}

/** What the table renders. Flattened, so the client never walks a populated doc. */
export interface ParentRow {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  occupation: string | null;
  address: string | null;
  emergencyPhone: string | null;
  status: string;
  lastLoginAt: string | null;
  children: ParentChild[];
}

type PopulatedParent = Omit<IParent, "user"> & { user: IUser | null };

export function toParentRow(
  parent: PopulatedParent,
  students: IStudent[] = [],
): ParentRow {
  const user = parent.user;
  const first = user?.firstName ?? "";
  const last = user?.lastName ?? "";

  return {
    id: String(parent._id),
    userId: user ? String(user._id) : "",
    email: user?.email ?? "",
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`.trim(),
    phone: user?.phone ?? null,
    occupation: parent.occupation ?? null,
    address: parent.address ?? null,
    emergencyPhone: parent.emergencyPhone ?? null,
    status: user?.status ?? USER_STATUS.SUSPENDED,
    lastLoginAt: user?.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    // The link lives on the student, not here - see the note on the Parent
    // model - so the caller passes in the students it already fetched.
    children: students
      .filter((student) =>
        student.guardians.some((g) => String(g.parent) === String(parent._id)),
      )
      .map((student) => {
        const link = student.guardians.find(
          (g) => String(g.parent) === String(parent._id),
        );
        return {
          id: String(student._id),
          name: `${student.firstName} ${student.lastName}`.trim(),
          relationship: link?.relationship ?? GUARDIAN_RELATIONSHIP.GUARDIAN,
        };
      }),
  };
}
