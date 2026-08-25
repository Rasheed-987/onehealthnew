import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { taughtClassroomIds } from "@/lib/classroomScope";
import {
  PROGRESS_OPTIONS,
  hydrateProgressRows,
  summariseProgress,
  type DailyProgressRow,
} from "@/lib/dailyProgress";
import { findClassroomToWrite } from "@/lib/recordScope";
import { ageFrom } from "@/lib/students";
import {
  DailyProgress,
  Enrollment,
  Student,
  startOfDayUTC,
  toDayKey,
} from "@/models";
import { ENROLLMENT_STATUS, USER_ROLE } from "@/models/enums";

/**
 * Today's sheets for a whole room, ready to fill in.
 *
 * Distinct from `GET /api/daily-progress`, which reports sheets that already
 * exist. This one starts from the *roster* and left-joins whatever has been
 * written so far, so a child nobody has touched yet still appears, with
 * `sheet: null`. It is the screen a teacher opens after the register.
 *
 * Staff only, on `progress:write`. A guardian has no use for a whole-room
 * roster and should not be handed one - they read their own child through
 * `GET /api/daily-progress?student=...`.
 */

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("progress:write");
    const params = request.nextUrl.searchParams;

    /*
     * A teacher posted to exactly one room should not have to name it - that
     * is a picker with one option on a phone screen. Two or more, and the app
     * has to ask.
     */
    let classroomId = params.get("classroom");
    if (!classroomId && session.role === USER_ROLE.TEACHER) {
      const mine = await taughtClassroomIds(session);
      if (mine.length === 1) classroomId = mine[0];
    }
    if (!classroomId) {
      throw new ApiError(400, "Choose a classroom.", {
        classroom: "Choose a classroom.",
      });
    }

    const classroom = await findClassroomToWrite(
      session,
      classroomId,
      "fill in daily sheets for",
    );

    const dayParam = params.get("date");
    const date = startOfDayUTC(dayParam ?? new Date());
    if (Number.isNaN(date.getTime())) {
      throw new ApiError(400, "Enter a real date.");
    }
    if (date.getTime() > startOfDayUTC(new Date()).getTime()) {
      throw new ApiError(
        400,
        "You cannot fill in a daily sheet for a future day.",
      );
    }

    /*
     * The roster is read from Enrollment, not from existing sheets: a child
     * seated this morning has no sheet yet and must still show up.
     */
    const enrolments = await Enrollment.find({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    });

    const students = await Student.find({
      _id: { $in: enrolments.map((e) => e.student) },
    }).sort({ lastName: 1, firstName: 1 });

    /*
     * Sheets are looked up by `{ student, date }` and NOT filtered by
     * classroom. If a child transferred rooms earlier today, their single
     * sheet for the day currently names the other room - hiding it would show
     * the teacher a blank sheet and let them silently overwrite a whole day of
     * drinks, naps and nappy changes.
     */
    const sheets = await DailyProgress.find({
      student: { $in: students.map((s) => s._id) },
      date,
    });
    // Keyed off each hydrated row's own student id rather than by array
    // position, so this cannot quietly break if hydration ever reorders.
    const rows = await hydrateProgressRows(sheets);
    const rowFor = new Map<string, DailyProgressRow>(
      rows.map((row) => [row.student.id, row]),
    );

    const entries = students.map((student) => {
      const row = rowFor.get(String(student._id)) ?? null;
      return {
        student: {
          id: String(student._id),
          fullName: `${student.firstName} ${student.lastName}`.trim(),
          age: ageFrom(student.dateOfBirth),
          photoUrl: student.photoUrl ?? null,
        },
        /** null means nobody has opened this child's sheet today. */
        sheet: row,
        // False when the sheet was written in the room the child has since left.
        recordedInThisClassroom: row
          ? row.classroom?.id === String(classroom._id)
          : false,
      };
    });

    return ok({
      classroom: {
        id: String(classroom._id),
        name: classroom.name,
        gradeLevel: classroom.gradeLevel,
      },
      date: toDayKey(date),
      entries,
      summary: summariseProgress(rows),
      /** Roster size minus the children whose sheet has anything on it. */
      notStarted: entries.filter((e) => !e.sheet || e.sheet.isEmpty).length,
      // Saves the form a second request just to render its checkboxes.
      options: PROGRESS_OPTIONS,
    });
  });
}
