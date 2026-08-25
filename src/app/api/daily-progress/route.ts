import mongoose, { Types } from "mongoose";
import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { dayRangeFilter } from "@/lib/attendance";
import {
  SaveProgressSchema,
  buildProgressUpdate,
  hydrateProgressRows,
  summariseProgress,
} from "@/lib/dailyProgress";
import { findStudentToRecord } from "@/lib/progressScope";
import {
  narrowToClassroom,
  narrowToStudent,
  resolveRecordScope,
} from "@/lib/recordScope";
import { DailyProgress, startOfDayUTC } from "@/models";

/**
 * The daily sheet: reading it back, and saving it.
 *
 * Neither handler branches on role. `resolveRecordScope` turns the session
 * into a filter once - the whole school for a super admin, the caller's rooms
 * for a teacher, the caller's children for a guardian - and everything below
 * ANDs that in. See lib/recordScope.ts.
 */

/** Nothing sensible asks for more sheets than this in one page. */
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("progress:list");
    const scope = await resolveRecordScope(session);
    const params = request.nextUrl.searchParams;

    // Start from the caller's scope, then narrow by whatever they asked for.
    // `narrowTo*` re-checks the id against the scope, so a guardian passing
    // another family's student id gets a 404, not that child's sheet.
    let filter: Record<string, unknown> = { ...scope.filter };

    const classroom = params.get("classroom");
    if (classroom) filter = narrowToClassroom(scope, classroom);

    const student = params.get("student");
    if (student) filter = { ...filter, ...narrowToStudent(scope, student) };

    // `date` is the single-day shorthand the sheet screen uses; `from`/`to`
    // is the range the admin table and the monthly report use.
    const day = params.get("date");
    const dates = day
      ? { $gte: startOfDayUTC(day), $lte: startOfDayUTC(day) }
      : dayRangeFilter(
          params.get("from") ?? undefined,
          params.get("to") ?? undefined,
        );
    if (dates) filter.date = dates;

    // Clamped at both ends: a negative limit is a special, cursor-closing
    // value in MongoDB rather than the no-op the caller meant.
    const limit = Math.min(
      Math.max(Number(params.get("limit")) || 100, 1),
      MAX_LIMIT,
    );

    const records = await DailyProgress.find(filter)
      .sort({ date: -1, updatedAt: -1 })
      .limit(limit);

    const rows = await hydrateProgressRows(records);

    return ok({
      scope: {
        role: session.role,
        // Lets the client decide whether to render a classroom picker at all.
        classroomIds: scope.classroomIds,
      },
      records: rows,
      summary: summariseProgress(rows),
    });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("progress:write");
    const input = await parseBody(request, SaveProgressSchema);

    // Stricter than reading, and the classroom is derived from the child's
    // active enrolment rather than trusted from the body - see progressScope.
    const { student, classroom } = await findStudentToRecord(
      session,
      input.student,
    );

    const date = startOfDayUTC(input.date);
    if (date.getTime() > startOfDayUTC(new Date()).getTime()) {
      throw new ApiError(
        400,
        "You cannot fill in a daily sheet for a future day.",
      );
    }

    const update = buildProgressUpdate(input, {
      classroom: classroom._id,
      recordedBy: session.userId,
    });

    const filter = { student: new Types.ObjectId(String(student._id)), date };
    const options = {
      upsert: true,
      new: true,
      // A brand-new sheet gets `drinks: []`, `moods: []` and so on rather than
      // missing keys, so every row has the same shape. Mongoose defaults this
      // to true; set explicitly so the intent survives a config change.
      setDefaultsOnInsert: true,
      /*
       * Defence in depth, NOT the primary gate. This re-runs the schema-level
       * validators (the `enum` on moods/needs/toilet.type, the `match` on each
       * time) against the `$set` paths. It does NOT run the `pre("validate")`
       * hook - which is exactly why the zod schema restates those four rules.
       * Do not delete the zod refines on the strength of this line.
       */
      runValidators: true,
      includeResultMetadata: true,
    } as const;

    let result;
    try {
      result = await DailyProgress.findOneAndUpdate(filter, update, options);
    } catch (error) {
      /*
       * Two teachers saving the same child in the same instant: both upserts
       * miss the row, both try to insert, and the unique `{student, date}`
       * index rejects the loser with E11000. `handle()` would render that as
       * "That student is already taken", which is nonsense to a teacher.
       * Retrying once finds the row the winner just wrote and updates it.
       */
      const isDuplicate =
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000;
      if (!isDuplicate) throw error;
      result = await DailyProgress.findOneAndUpdate(filter, update, options);
    }

    const record = result?.value;
    if (!record) {
      throw new ApiError(500, "The sheet could not be saved. Please try again.");
    }

    const [row] = await hydrateProgressRows([record]);
    const created = !result.lastErrorObject?.updatedExisting;

    return ok({ created, record: row }, created ? 201 : 200);
  });
}
