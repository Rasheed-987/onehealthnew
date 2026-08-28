import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  CreateFeedbackSchema,
  hydrateFeedbackRows,
  resolveFeedbackScope,
  type FeedbackSummary,
} from "@/lib/feedback";
import { escapeRegex } from "@/lib/teachers";
import { Feedback, User } from "@/models";
import {
  FEEDBACK_EXPERIENCE,
  FEEDBACK_MAX_STARS,
  FEEDBACK_MIN_STARS,
  type FeedbackExperience,
} from "@/models/enums";

/**
 * Guardian feedback: leaving it, and the super admin's table of it.
 *
 * Neither handler branches on role. `resolveFeedbackScope` turns the session
 * into a filter once - everything for the super admin, their own submissions
 * for a guardian - and `feedback:create` is what keeps staff out of the write
 * path entirely.
 */

/**
 * Columns a client may sort on.
 *
 * A closed list rather than the raw query value, because this string reaches
 * `sort()` - an open one would let a caller sort by, and so probe, any field on
 * the document. `user` is deliberately absent: the submitter's name lives on
 * User, so sorting by it means a join, and it is not worth an aggregation
 * pipeline for a column whose usual question ("who said this?") the search box
 * already answers.
 */
const SORTABLE = ["createdAt", "stars", "experience", "comment"] as const;

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  experience: z.enum(FEEDBACK_EXPERIENCE).optional(),
  stars: z.coerce
    .number()
    .int()
    .min(FEEDBACK_MIN_STARS)
    .max(FEEDBACK_MAX_STARS)
    .optional(),
  sort: z.enum(SORTABLE).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  // Matches the "Show N entries" selector, which tops out at 100.
  perPage: z.coerce.number().int().min(1).max(100).default(10),
});

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("feedback:list");
    const { search, experience, stars, sort, order, page, perPage } =
      ListQuerySchema.parse(
        Object.fromEntries(request.nextUrl.searchParams),
      );

    // Scope first, so everything below narrows it and nothing replaces it.
    const filter: Record<string, unknown> = resolveFeedbackScope(session);

    if (experience) filter.experience = experience;
    if (stars !== undefined) filter.stars = stars;

    if (search) {
      /*
       * The search box covers both what was written and who wrote it. The name
       * and email live on User, so that half resolves to ids first - the same
       * two-step as the parents list, and for the same reason: a regex cannot
       * reach across a reference.
       */
      const pattern = new RegExp(escapeRegex(search), "i");
      const userIds = await User.find({
        $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }],
      }).distinct("_id");

      filter.$and = [
        { $or: [{ comment: pattern }, { submittedBy: { $in: userIds } }] },
      ];
    }

    const [rows, total, stats] = await Promise.all([
      Feedback.find(filter)
        // `_id` breaks ties on every sort. Without it two rows with the same
        // rating can swap places between pages and one of them is never shown.
        .sort({ [sort]: order === "asc" ? 1 : -1, _id: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Feedback.countDocuments(filter),
      // Over the whole filtered set rather than the page on screen - an
      // average of "the ten rows you happen to be looking at" is misleading.
      Feedback.aggregate<{ _id: FeedbackExperience; count: number; stars: number }>(
        [
          { $match: filter },
          {
            $group: {
              _id: "$experience",
              count: { $sum: 1 },
              stars: { $sum: "$stars" },
            },
          },
        ],
      ),
    ]);

    const byExperience = Object.fromEntries(
      Object.values(FEEDBACK_EXPERIENCE).map((value) => [value, 0]),
    ) as Record<FeedbackExperience, number>;
    let starTotal = 0;
    let rated = 0;
    for (const group of stats) {
      byExperience[group._id] = group.count;
      starTotal += group.stars;
      rated += group.count;
    }

    const summary: FeedbackSummary = {
      total,
      // One decimal place: the difference between 4.6 and 4.63 is not a
      // difference anyone acts on.
      averageStars: rated === 0 ? null : Math.round((starTotal / rated) * 10) / 10,
      byExperience,
    };

    return ok({
      feedback: await hydrateFeedbackRows(rows),
      summary,
      pagination: {
        page,
        perPage,
        total,
        pageCount: Math.max(1, Math.ceil(total / perPage)),
      },
    });
  });
}

/**
 * Leaving feedback.
 *
 * POST rather than PUT, and no natural key: a guardian may leave feedback as
 * often as they have something to say, and a second piece is a second row -
 * not an edit of the first. That is also why there is no PUT anywhere in this
 * module. See the note on the model.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("feedback:create");
    const input = await parseBody(request, CreateFeedbackSchema);

    // `submittedBy` comes off the session and is never read from the body, so
    // there is no way to file a comment under somebody else's name.
    const feedback = await Feedback.create({
      submittedBy: session.userId,
      experience: input.experience,
      stars: input.stars,
      comment: input.comment,
    });

    const [row] = await hydrateFeedbackRows([feedback]);
    return ok({ feedback: row }, 201);
  });
}
