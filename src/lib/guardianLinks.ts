import { z } from "zod";

import { GUARDIAN_RELATIONSHIP } from "@/models/enums";
import type { GuardianLinkStatus } from "@/models/enums";

/**
 * Shapes shared by the guardian-link routes and the screens that call them.
 *
 * Mongoose-free on purpose, exactly like `students.ts`: the dashboard table is
 * a client component and must be able to import these types without dragging a
 * model file into the browser bundle.
 */

export const ListQuerySchema = z.object({
  status: z
    .enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
    .optional()
    .default("PENDING"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Staff may correct the relationship while approving. The app never asks the
 * family for it - one more field on a sign-up form buys less than the school
 * knowing which of the two parents this is when they read the contact card.
 */
export const ApproveSchema = z.object({
  relationship: z.enum(GUARDIAN_RELATIONSHIP).optional(),
});

export const RejectSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

/** A guardian submitting a further child from inside the app. */
export const CreateLinkRequestSchema = z.object({
  studentId: z.string().trim().min(1, "Enter your child's student ID."),
});

export interface GuardianLinkRequestRow {
  id: string;
  status: GuardianLinkStatus;
  relationship: string;
  /** What they typed, which may differ in case from the child's real ID. */
  studentIdTyped: string;
  requestedAt: string;
  decidedAt: string | null;
  note: string | null;
  parent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  /**
   * Null only if the child was deleted between the request and the review -
   * the row is still shown, because a request pointing at nothing is exactly
   * the thing staff need to see rather than have silently hidden.
   */
  student: {
    id: string;
    fullName: string;
    studentId: string | null;
    classroom: string | null;
  } | null;
}
