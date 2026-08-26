import { ApiError } from "@/lib/api";
import { teacherProfileId, taughtClassroomIds } from "@/lib/classroomScope";
import { teachesClassroom } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";
import { guardedStudentIds } from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, type IClassroom } from "@/models";
import { USER_ROLE } from "@/models/enums";

/**
 * Who may see which per-child, per-day record.
 *
 * `permissions.ts` answers the coarse half - "may a parent read attendance at
 * all". This module answers the half that actually keeps the school's data
 * apart:
 *
 *   SUPER_ADMIN  every row in the school
 *   TEACHER      every row for the rooms they are posted to
 *   PARENT       every row for the children they are a guardian of
 *
 * All three come out as a plain Mongo filter to AND into a query, so a route
 * never branches on role itself - it resolves the scope once and hands the
 * filter to `find`. Adding a role later means changing this function and
 * nothing else.
 *
 * Deliberately NOT attendance-specific. Attendance, DailyProgress and
 * ClinicalVisit are the same shape of record - one row naming a single child
 * and carrying a denormalised `classroom` - so the same filter drives all
 * three. Note that it is that SHAPE, not the cardinality, that matters here:
 * the first two are unique per child per day, while a child can be seen by the
 * nurse twice in a morning, and the filter is unaffected either way.
 * Duplicating this per feature would mean maintaining the school's
 * data-isolation rules in three places, which is how one of them quietly rots.
 *
 * The teacher case is cheap only because `classroom` is denormalised onto the
 * row (see the note on the Attendance model): the filter is `{ classroom:
 * {$in: [...] }, date }`, which the `{ classroom, date, ... }` index on each
 * collection serves directly. Had the room been resolved through Enrollment on
 * read, this would have been an aggregation on every page.
 */

export interface RecordScope {
  /** AND this into every query. `{}` only for the super admin. */
  filter: Record<string, unknown>;
  /** Rooms the caller may read. `null` means "no restriction". */
  classroomIds: string[] | null;
  /** Children the caller may read. `null` means "no restriction". */
  studentIds: string[] | null;
}

export async function resolveRecordScope(
  session: SessionPayload,
): Promise<RecordScope> {
  if (session.role === USER_ROLE.SUPER_ADMIN) {
    return { filter: {}, classroomIds: null, studentIds: null };
  }

  if (session.role === USER_ROLE.TEACHER) {
    const classroomIds = await taughtClassroomIds(session);
    /*
     * A teacher on no rooms yields `{ classroom: { $in: [] } }`, which matches
     * nothing - deliberately. Collapsing an empty list to `{}` here would hand
     * them the whole school, which is the exact shape of bug this module
     * exists to prevent.
     */
    return {
      filter: { classroom: { $in: classroomIds } },
      classroomIds,
      studentIds: null,
    };
  }

  const studentIds = await guardedStudentIds(session);
  return {
    filter: { student: { $in: studentIds } },
    classroomIds: null,
    studentIds,
  };
}

/**
 * Narrows a scope to one classroom the caller asked for.
 *
 * Returns a filter, not a boolean, so the caller cannot forget to apply it.
 * A room outside the scope is 404 rather than 403, matching
 * `findStudentInScope` - "that room exists, you just cannot see it" leaks the
 * school's structure.
 */
export function narrowToClassroom(
  scope: RecordScope,
  classroomId: string,
): Record<string, unknown> {
  if (!isObjectId(classroomId)) {
    throw new ApiError(400, "That is not a valid classroom id.");
  }
  if (scope.classroomIds && !scope.classroomIds.includes(classroomId)) {
    throw new ApiError(404, "Classroom not found.");
  }
  return { ...scope.filter, classroom: classroomId };
}

/** Same, for a single child. */
export function narrowToStudent(
  scope: RecordScope,
  studentId: string,
): Record<string, unknown> {
  if (!isObjectId(studentId)) {
    throw new ApiError(400, "That is not a valid student id.");
  }
  if (scope.studentIds && !scope.studentIds.includes(studentId)) {
    throw new ApiError(404, "Student not found.");
  }
  return { ...scope.filter, student: studentId };
}

/**
 * The write gate: the room whose day the caller is about to write to.
 *
 * Writing is stricter than reading. A teacher must be *posted to* the room -
 * `attendance:mark` or `progress:write` alone only says teachers may do this
 * in general, not that this teacher may do it here.
 *
 * `action` only shapes the 403 wording. It is a parameter rather than a fixed
 * string so the teacher is told which thing they were refused, instead of
 * being told about the register when they were filling in a daily sheet.
 */
export async function findClassroomToWrite(
  session: SessionPayload,
  classroomId: string,
  action = "take the register for",
): Promise<IClassroom> {
  if (!isObjectId(classroomId)) {
    throw new ApiError(400, "That is not a valid classroom id.");
  }
  const classroom = await Classroom.findById(classroomId);
  if (!classroom) throw new ApiError(404, "Classroom not found.");

  if (session.role === USER_ROLE.SUPER_ADMIN) return classroom;

  const teacherId = await teacherProfileId(session);
  if (!teachesClassroom(teacherId, classroom)) {
    throw new ApiError(
      403,
      `You can only ${action} a classroom you are assigned to.`,
    );
  }
  return classroom;
}
