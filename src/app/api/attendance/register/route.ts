import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { summarise } from "@/lib/attendance";
import { taughtClassroomIds } from "@/lib/classroomScope";
import { findClassroomToWrite } from "@/lib/recordScope";
import { ageFrom } from "@/lib/students";
import { Attendance, Enrollment, Student, startOfDayUTC, toDayKey } from "@/models";
import { ATTENDANCE_STATUS_LABEL, ENROLLMENT_STATUS, USER_ROLE } from "@/models/enums";

/**
 * Today's sheet, ready to fill in - the screen the teacher opens on their
 * phone.
 *
 * Distinct from `GET /api/attendance`, which reports lines that already exist.
 * This one starts from the *roster* and left-joins whatever has been marked so
 * far, so a child nobody has touched yet still appears, with `status: null`.
 * The app renders one row per child either way and POSTs the whole lot back to
 * `/api/attendance`.
 */

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("attendance:mark");
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

    const classroom = await findClassroomToWrite(session, classroomId);

    const dayParam = params.get("date");
    const date = startOfDayUTC(dayParam ?? new Date());
    if (Number.isNaN(date.getTime())) {
      throw new ApiError(400, "Enter a real date.");
    }
    if (date.getTime() > startOfDayUTC(new Date()).getTime()) {
      throw new ApiError(400, "You cannot take the register for a future day.");
    }

    /*
     * The roster is read from Enrollment, not from past attendance rows: a
     * child seated this morning has no line yet and must still show up on the
     * sheet.
     */
    const enrollments = await Enrollment.find({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    });

    const students = await Student.find({
      _id: { $in: enrollments.map((e) => e.student) },
    }).sort({ lastName: 1, firstName: 1 });

    /*
     * Marks are looked up by `{ student, date }` and NOT filtered by
     * classroom. If a child transferred rooms earlier today, their single line
     * for the day currently names the other room - hiding it would show the
     * teacher an unmarked child and let them silently overwrite it.
     */
    const marks = await Attendance.find({
      student: { $in: students.map((s) => s._id) },
      date,
    });
    const markFor = new Map(marks.map((m) => [String(m.student), m]));

    const entries = students.map((student) => {
      const mark = markFor.get(String(student._id));
      return {
        student: {
          id: String(student._id),
          fullName: `${student.firstName} ${student.lastName}`.trim(),
          age: ageFrom(student.dateOfBirth),
          photoUrl: student.photoUrl ?? null,
        },
        /** null means nobody has marked this child yet today. */
        status: mark?.status ?? null,
        statusLabel: mark ? ATTENDANCE_STATUS_LABEL[mark.status] : null,
        checkInAt: mark?.checkInAt ?? null,
        checkOutAt: mark?.checkOutAt ?? null,
        note: mark?.note ?? null,
        // False when the line was taken in the room the child has since left.
        markedInThisClassroom: mark
          ? String(mark.classroom) === String(classroom._id)
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
      summary: summarise(marks),
      /** Roster size minus the children already marked. */
      unmarked: entries.filter((e) => e.status === null).length,
    });
  });
}
