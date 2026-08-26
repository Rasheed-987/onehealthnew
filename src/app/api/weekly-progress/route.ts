import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { taughtClassroomIds } from "@/lib/classroomScope";
import { hydrateProgressRows } from "@/lib/dailyProgress";
import {
  narrowToClassroom,
  narrowToStudent,
  resolveRecordScope,
} from "@/lib/recordScope";
import { ageFrom } from "@/lib/students";
import {
  endOfWeekUTC,
  formatWeekRange,
  rollUpWeek,
  startOfWeekUTC,
  summariseWeek,
  weekDayKeys,
} from "@/lib/weeklyProgress";
import { Classroom, DailyProgress, Enrollment, Student, toDayKey } from "@/models";
import { ENROLLMENT_STATUS, USER_ROLE } from "@/models/enums";

/**
 * A week of daily sheets, folded into one row per child.
 *
 * Deliberately a read-only roll-up of `DailyProgress` and not its own record:
 * see the note at the top of lib/weeklyProgress.ts. There is no POST here and
 * there should not be - a week is corrected by correcting the day it is wrong
 * on, through `POST /api/daily-progress`.
 *
 * Scoping is inherited, not re-implemented. The sheets are fetched through the
 * same `resolveRecordScope` filter the daily list uses, so a guardian sees a
 * week of their own children and a teacher a week of their own rooms, without
 * this route ever branching on role.
 *
 * Query:
 *   ?week=YYYY-MM-DD   any day in the week; snapped back to its Monday
 *   ?classroom=<id>    staff only in effect - out of scope reads as 404
 *   ?student=<id>      one child, for the guardian view and for drill-down
 */

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("progress:list");
    const scope = await resolveRecordScope(session);
    const params = request.nextUrl.searchParams;

    const weekParam = params.get("week");
    if (weekParam && Number.isNaN(Date.parse(weekParam))) {
      throw new ApiError(400, "Enter a real date.");
    }
    const start = startOfWeekUTC(weekParam ?? new Date());
    const end = endOfWeekUTC(start);

    /*
     * `?classroom=` is a staff control and is ignored for a guardian.
     *
     * Not cosmetic. Below, naming a room switches the roster from "children
     * with a sheet" to "everyone enrolled in the room" - which is the whole
     * point of the screen for staff, and a roll of other people's children for
     * a guardian. `narrowToClassroom` would not catch it either: a guardian's
     * `classroomIds` is null, so it has nothing to check the room against.
     * `studentIds` is set for exactly one role, so it is the honest test for
     * "this caller is defined by their children, not by a room".
     */
    const boundToChildren = scope.studentIds !== null;

    /*
     * A teacher posted to exactly one room should not have to name it, the
     * same courtesy `/api/daily-progress/sheets` extends. An admin has no
     * single room to guess at.
     */
    let classroomId = boundToChildren ? null : params.get("classroom");
    if (!classroomId && session.role === USER_ROLE.TEACHER) {
      const mine = await taughtClassroomIds(session);
      if (mine.length === 1) classroomId = mine[0];
    }

    // Narrowing re-checks each id against the scope, so a guardian passing
    // another family's student id gets a 404 rather than that child's week.
    let filter: Record<string, unknown> = { ...scope.filter };
    if (classroomId) filter = narrowToClassroom(scope, classroomId);

    const studentId = params.get("student");
    if (studentId) filter = { ...filter, ...narrowToStudent(scope, studentId) };

    filter.date = { $gte: start, $lte: end };

    /*
     * Seven days for one room is at most a few dozen sheets, so this is an
     * unpaginated read on purpose - a page boundary in the middle of a week
     * would silently under-report a child's totals, which is worse than the
     * query being a little larger.
     */
    const records = await DailyProgress.find(filter).sort({ date: 1 });
    const rows = await hydrateProgressRows(records);

    /*
     * Who to report on. The roster is the point of the screen: a child with no
     * sheets at all is exactly what a head of room wants to spot, and building
     * the rows from the sheets that exist would hide them. Each branch is the
     * best roster available to that caller.
     */
    let rosterIds: string[];
    if (scope.studentIds) {
      /*
       * A guardian: their own children, sheets or no sheets. Checked FIRST,
       * before the room branch below - see `boundToChildren` above. Getting
       * this order wrong hands a guardian the names and ages of every child
       * in a room they named.
       */
      rosterIds = scope.studentIds;
    } else if (classroomId) {
      // A named room: everyone actually seated in it.
      rosterIds = (
        await Enrollment.find({
          classroom: classroomId,
          status: ENROLLMENT_STATUS.ACTIVE,
        }).distinct("student")
      ).map(String);
    } else {
      // An admin across the whole school, or a teacher on several rooms who
      // has not chosen one. There is no single roster to speak of, so the
      // honest answer is the children who have a sheet this week.
      rosterIds = Array.from(new Set(rows.map((row) => row.student.id)));
    }

    // An explicit ?student= wins over the roster it came from - both have
    // already been checked against the scope above.
    if (studentId) {
      rosterIds = rosterIds.includes(studentId) ? [studentId] : [];
    }

    const students = await Student.find({ _id: { $in: rosterIds } }).sort({
      lastName: 1,
      firstName: 1,
    });

    const children = rollUpWeek(
      start,
      students.map((student) => ({
        id: String(student._id),
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        age: ageFrom(student.dateOfBirth),
        photoUrl: student.photoUrl ?? null,
      })),
      rows,
    );

    // Named only so the header can say which room it is reporting on. The
    // gate was `narrowToClassroom` above, not this lookup.
    const classroom = classroomId
      ? await Classroom.findById(classroomId).select("name gradeLevel")
      : null;

    return ok({
      week: {
        start: toDayKey(start),
        end: toDayKey(end),
        label: formatWeekRange(start),
        days: weekDayKeys(start),
      },
      scope: {
        role: session.role,
        // Lets the client decide whether to render a classroom picker at all.
        classroomIds: scope.classroomIds,
        // Echoed because a teacher on one room never asked for it.
        classroom: classroom
          ? {
              id: String(classroom._id),
              name: classroom.name,
              gradeLevel: classroom.gradeLevel,
            }
          : null,
      },
      children,
      summary: summariseWeek(children),
    });
  });
}
