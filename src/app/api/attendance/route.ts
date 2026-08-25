import { Types } from "mongoose";
import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  MarkRegisterSchema,
  dayRangeFilter,
  hydrateAttendanceRows,
  summarise,
} from "@/lib/attendance";
import {
  findClassroomToWrite,
  narrowToClassroom,
  narrowToStudent,
  resolveRecordScope,
} from "@/lib/recordScope";
import { isObjectId } from "@/lib/teachers";
import { Attendance, Enrollment, startOfDayUTC } from "@/models";
import { ATTENDANCE_STATUS, ENROLLMENT_STATUS } from "@/models/enums";

/**
 * The register: reading it back, and taking it.
 *
 * Neither handler branches on role. `resolveAttendanceScope` turns the session
 * into a filter once - the whole school for a super admin, the caller's rooms
 * for a teacher, the caller's children for a guardian - and everything below
 * ANDs that in. See lib/attendanceScope.ts.
 */

/** Nothing sensible asks for more of a register than this in one page. */
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("attendance:list");
    const scope = await resolveRecordScope(session);
    const params = request.nextUrl.searchParams;

    // Start from the caller's scope, then narrow by whatever they asked for.
    // `narrowTo*` re-checks the id against the scope, so a guardian passing
    // another family's student id gets a 404, not that child's register.
    let filter: Record<string, unknown> = { ...scope.filter };

    const classroom = params.get("classroom");
    if (classroom) filter = narrowToClassroom(scope, classroom);

    const student = params.get("student");
    if (student) filter = { ...filter, ...narrowToStudent(scope, student) };

    // `date` is the single-day shorthand the register screen uses; `from`/`to`
    // is the range the admin table and the monthly report use.
    const day = params.get("date");
    const dates = day
      ? { $gte: startOfDayUTC(day), $lte: startOfDayUTC(day) }
      : dayRangeFilter(
          params.get("from") ?? undefined,
          params.get("to") ?? undefined,
        );
    if (dates) filter.date = dates;

    const status = params.get("status");
    if (status) {
      // `Object.values`, not `status in ATTENDANCE_STATUS` - `in` walks the
      // prototype chain, so "constructor" would sail through.
      if (!(Object.values(ATTENDANCE_STATUS) as string[]).includes(status)) {
        throw new ApiError(400, "That is not a valid attendance status.");
      }
      filter.status = status;
    }

    // Clamped at both ends: a negative limit is a special, cursor-closing
    // value in MongoDB rather than the no-op the caller meant.
    const limit = Math.min(
      Math.max(Number(params.get("limit")) || 100, 1),
      MAX_LIMIT,
    );

    const records = await Attendance.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit);

    return ok({
      scope: {
        role: session.role,
        // Lets the client decide whether to render a classroom picker at all.
        classroomIds: scope.classroomIds,
      },
      records: await hydrateAttendanceRows(records),
      summary: summarise(records),
    });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("attendance:mark");
    const input = await parseBody(request, MarkRegisterSchema);

    // Stricter than reading: a teacher must be posted to this room, not merely
    // allowed to take registers in general.
    const classroom = await findClassroomToWrite(session, input.classroom);

    const badId = input.entries.find((e) => !isObjectId(e.student));
    if (badId) {
      throw new ApiError(400, "That is not a valid student id.");
    }

    /*
     * Every child on the submitted register must actually be sitting in this
     * room. Without this, `{ student, date }` being unique means a teacher
     * could post another room's child and overwrite that room's line for the
     * day - the denormalised `classroom` would follow the write.
     */
    const seated = await Enrollment.find({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
      student: { $in: input.entries.map((e) => e.student) },
    }).distinct("student");

    const seatedIds = new Set(seated.map(String));
    const strangers = input.entries.filter((e) => !seatedIds.has(e.student));
    if (strangers.length > 0) {
      throw new ApiError(
        400,
        strangers.length === 1
          ? "One of these children is not in this classroom."
          : `${strangers.length} of these children are not in this classroom.`,
        { entries: strangers.map((e) => e.student) },
      );
    }

    const date = startOfDayUTC(input.date);
    if (date.getTime() > startOfDayUTC(new Date()).getTime()) {
      throw new ApiError(400, "You cannot take the register for a future day.");
    }

    /*
     * One `bulkWrite` rather than a save per child: the mobile app submits the
     * whole room at once, and a partial register - eleven children in, nine
     * lost to a dropped connection - is worse than a clean failure.
     *
     * Upsert, not insert. `{ student, date }` is unique, so re-marking a child
     * has to update the existing line; an insert would surface as a duplicate
     * key error and be reported to the teacher as "that student is already
     * taken", which is nonsense.
     *
     * The `$unset` half matters: a child switched from LATE to ABSENT must
     * lose their check-in time, or the row lands in exactly the state the
     * model's validator forbids.
     */
    const ops = input.entries.map((entry) => {
      const isAway =
        entry.status === ATTENDANCE_STATUS.ABSENT ||
        entry.status === ATTENDANCE_STATUS.EXCUSED;

      const set: Record<string, unknown> = {
        classroom: classroom._id,
        status: entry.status,
        recordedBy: session.userId,
      };
      const unset: Record<string, ""> = {};

      const put = (field: "checkInAt" | "checkOutAt" | "note", value?: string) => {
        if (value) set[field] = value;
        else unset[field] = "";
      };

      put("checkInAt", isAway ? undefined : entry.checkInAt);
      put("checkOutAt", isAway ? undefined : entry.checkOutAt);
      put("note", entry.note);

      return {
        updateOne: {
          // `student` and `date` come from the filter on insert, so they are
          // not repeated in the update.
          filter: { student: new Types.ObjectId(entry.student), date },
          update: Object.keys(unset).length
            ? { $set: set, $unset: unset }
            : { $set: set },
          upsert: true,
        },
      };
    });

    const result = await Attendance.bulkWrite(ops);

    const saved = await Attendance.find({
      classroom: classroom._id,
      date,
      student: { $in: input.entries.map((e) => e.student) },
    });

    return ok(
      {
        classroom: { id: String(classroom._id), name: classroom.name },
        date: input.date,
        created: result.upsertedCount,
        updated: result.modifiedCount,
        records: await hydrateAttendanceRows(saved),
        summary: summarise(saved),
      },
      201,
    );
  });
}
