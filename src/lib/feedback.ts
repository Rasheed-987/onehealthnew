import { Types } from "mongoose";
import { z } from "zod";

import type { SessionPayload } from "@/lib/session";
import { User } from "@/models";
import type { IFeedback, IUser } from "@/models";
import {
  FEEDBACK_EXPERIENCE,
  FEEDBACK_EXPERIENCE_LABEL,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MAX_STARS,
  FEEDBACK_MIN_STARS,
  USER_ROLE,
  type FeedbackExperience,
} from "@/models/enums";

/**
 * Shapes shared by the feedback routes and the screens that call them.
 *
 * The module is small because the feature is: one collection, no child
 * records, no classroom, and therefore none of the scope machinery the rest of
 * the dashboard needs. `resolveFeedbackScope` is two lines rather than a call
 * into `recordScope.ts` precisely because feedback names no student - there is
 * nothing here for a teacher's classroom filter to bite on.
 */

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Leaving feedback. Guardians only - see `feedback:create`.
 *
 * The caller does not name themselves: `submittedBy` comes off the session, so
 * there is no field here for a client to put someone else's id in. Nor is
 * there a `createdAt` - a comment dated by whoever sent it is not evidence of
 * anything.
 */
export const CreateFeedbackSchema = z.object({
  experience: z.enum(FEEDBACK_EXPERIENCE),
  stars: z.coerce
    .number()
    .int("Pick a whole number of stars.")
    .min(FEEDBACK_MIN_STARS, `Give it at least ${FEEDBACK_MIN_STARS} star.`)
    .max(FEEDBACK_MAX_STARS, `${FEEDBACK_MAX_STARS} stars is the most there is.`),
  comment: z
    .string()
    .trim()
    .min(1, "Tell us a little about your experience.")
    .max(
      FEEDBACK_MAX_LENGTH,
      `Feedback cannot be longer than ${FEEDBACK_MAX_LENGTH} characters.`,
    ),
});
export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** The columns on the admin table, one row at a time. */
export interface FeedbackRow {
  id: string;
  /**
   * Who left it, already resolved to a name. Null when the account is gone -
   * the row outlives the user, and the table draws that as "N/A" rather than
   * dropping a comment the school has already read.
   */
  user: { id: string; name: string; email: string } | null;
  experience: FeedbackExperience;
  experienceLabel: string;
  stars: number;
  comment: string;
  createdAt: string;
}

export function toFeedbackRow(
  feedback: IFeedback,
  users: Map<string, IUser>,
): FeedbackRow {
  const user = users.get(String(feedback.submittedBy));

  return {
    id: String(feedback._id),
    user: user
      ? {
          id: String(user._id),
          name: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
        }
      : null,
    experience: feedback.experience,
    experienceLabel: FEEDBACK_EXPERIENCE_LABEL[feedback.experience],
    stars: feedback.stars,
    comment: feedback.comment,
    createdAt: feedback.createdAt.toISOString(),
  };
}

/**
 * Fills in the names a page of feedback refers to by id.
 *
 * One `$in` rather than `populate`, for the same reason as every other
 * hydrator here: a family that leaves feedback tends to leave more than one
 * piece of it, so the same handful of accounts recur down the page.
 */
export async function hydrateFeedbackRows(
  rows: IFeedback[],
): Promise<FeedbackRow[]> {
  if (rows.length === 0) return [];

  const users = await User.find({
    _id: {
      $in: Array.from(new Set(rows.map((row) => String(row.submittedBy)))),
    },
  });
  const byId = new Map(users.map((user) => [String(user._id), user as IUser]));

  return rows.map((row) => toFeedbackRow(row, byId));
}

/**
 * Who may read which rows.
 *
 * The super admin reads the lot; anyone else reads their own. Returned as a
 * filter to AND into the query rather than as a boolean checked afterwards, so
 * a route cannot forget to apply it and another family's comment is
 * indistinguishable from one that does not exist.
 *
 * A real ObjectId, not the session's string. `find` would have cast it against
 * the schema, but the same filter is handed to `$match` in the summary
 * aggregation - and an aggregation pipeline does no casting at all, so a
 * string there silently matches nothing. A guardian would have seen their own
 * rows above a summary reading zero.
 */
export function resolveFeedbackScope(
  session: SessionPayload,
): Record<string, unknown> {
  if (session.role === USER_ROLE.SUPER_ADMIN) return {};
  return { submittedBy: new Types.ObjectId(session.userId) };
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The headline the admin screen puts above the table.
 *
 * Computed over the whole filtered set, not the page on screen: "4.6 average"
 * that silently means "of the ten rows you happen to be looking at" is worse
 * than no average at all.
 */
export interface FeedbackSummary {
  total: number;
  /** Null when nothing matched - there is no average of no ratings. */
  averageStars: number | null;
  /** How many left each word, for the four experience chips. */
  byExperience: Record<FeedbackExperience, number>;
}
