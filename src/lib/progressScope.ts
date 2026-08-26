import { ApiError } from "@/lib/api";
import { teacherProfileId } from "@/lib/classroomScope";
import { teachesClassroom } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Student } from "@/models";
import type { IClassroom, IStudent } from "@/models";
import { ENROLLMENT_STATUS, USER_ROLE } from "@/models/enums";

/**
 * The write gate for records about a CHILD.
 *
 * Reading is handled entirely by `resolveRecordScope` in `recordScope.ts` -
 * Attendance, DailyProgress and ClinicalVisit are the same shape of record, so
 * they share it. Writing is not shared, because the subject differs: taking a
 * register is an operation on a ROOM, while filling in a daily sheet or writing
 * up a clinical visit is an operation on a CHILD. This module is that one
 * difference, and both child-shaped features use it.
 */

/**
 * Loads the child whose sheet is about to be written, and the room it belongs
 * to, or throws.
 *
 * The classroom is DERIVED from the child's active enrolment rather than taken
 * from the request body. Two reasons:
 *
 *   1. The client already knows the student - making it also send a matching
 *      classroom invents a way for the two to disagree.
 *   2. `classroom` is denormalised onto the sheet. If a caller could name it,
 *      a teacher posted to Room A could write a Room-B child's sheet and drag
 *      it into Room A, where it would then be visible to Room A's staff on
 *      every later scoped read. Deriving it closes that off entirely - there
 *      is no field to lie in.
 *
 * A child with no active enrolment is a 400, not a 404: the child exists, the
 * request is just not answerable until somebody seats them.
 *
 * `action` only shapes the 403 wording, exactly as it does on
 * `findClassroomToWrite`. A nurse refused a clinical visit should not be told
 * about the daily sheet.
 */
export async function findStudentToRecord(
  session: SessionPayload,
  studentId: string,
  action = "fill in a daily sheet for",
): Promise<{ student: IStudent; classroom: IClassroom }> {
  if (!isObjectId(studentId)) {
    throw new ApiError(400, "That is not a valid student id.");
  }

  const student = await Student.findById(studentId);
  if (!student) throw new ApiError(404, "Student not found.");

  // Served by the partial unique `{ student: 1 }` index on ACTIVE enrolments.
  const enrolment = await Enrollment.findOne({
    student: student._id,
    status: ENROLLMENT_STATUS.ACTIVE,
  });
  if (!enrolment) {
    throw new ApiError(
      400,
      "That child is not in a classroom yet, so there is no sheet to fill in.",
    );
  }

  const classroom = await Classroom.findById(enrolment.classroom);
  if (!classroom) throw new ApiError(404, "Classroom not found.");

  if (session.role === USER_ROLE.SUPER_ADMIN) return { student, classroom };

  /*
   * Stricter than reading. `progress:write` only says teachers fill in sheets
   * in general; this says THIS teacher may fill in THIS child's.
   */
  const teacherId = await teacherProfileId(session);
  if (!teachesClassroom(teacherId, classroom)) {
    throw new ApiError(
      403,
      `You can only ${action} a child in a classroom you are assigned to.`,
    );
  }

  return { student, classroom };
}
