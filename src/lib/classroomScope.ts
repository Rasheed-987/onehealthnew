import { ApiError } from "@/lib/api";
import { teachesClassroom } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";
import { guardedStudentIds } from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Teacher, type IClassroom } from "@/models";
import { ENROLLMENT_STATUS, USER_ROLE } from "@/models/enums";

/**
 * Who may see which classroom.
 *
 * `permissions.ts` says every role may `classroom:list` - which is true, and
 * on its own useless: it would hand a teacher the whole school's rooms and a
 * guardian every roster in the building. This module answers the row-level
 * half:
 *
 *   SUPER_ADMIN  every room
 *   TEACHER      the rooms they are posted to
 *   PARENT       the rooms their children are actively sitting in
 *
 * Same shape as `studentScope.ts` and `attendanceScope.ts`: a plain Mongo
 * filter to AND into a query, so a route resolves the scope once instead of
 * branching on role.
 *
 * It lives below `attendanceScope.ts` in the import graph rather than beside
 * it, because attendance scoping is built out of classroom scoping - a
 * teacher's register lines are exactly the lines for their rooms.
 */

/** The Teacher profile behind a signed-in staff member. */
export async function teacherProfileId(
  session: SessionPayload,
): Promise<string> {
  const teacher = await Teacher.findOne({ user: session.userId });
  if (!teacher) {
    throw new ApiError(
      403,
      "Your staff profile is missing, so no classrooms are linked to you.",
    );
  }
  return String(teacher._id);
}

/** Ids of every room this teacher is posted to, lead or assistant. */
export async function taughtClassroomIds(
  session: SessionPayload,
): Promise<string[]> {
  const teacherId = await teacherProfileId(session);
  // Served by the `{ "teachers.teacher": 1 }` index on Classroom.
  const ids = await Classroom.find({
    "teachers.teacher": teacherId,
  }).distinct("_id");
  return ids.map(String);
}

/**
 * Ids of every room this guardian's children are currently seated in.
 *
 * ACTIVE enrolments only: a room a child left in March is not a room the home
 * still gets to read the roster of.
 */
export async function parentClassroomIds(
  session: SessionPayload,
): Promise<string[]> {
  const studentIds = await guardedStudentIds(session);
  if (studentIds.length === 0) return [];
  const ids = await Enrollment.find({
    student: { $in: studentIds },
    status: ENROLLMENT_STATUS.ACTIVE,
  }).distinct("classroom");
  return ids.map(String);
}

/**
 * Rooms the caller may read. `null` means "no restriction" - super admin only.
 *
 * An empty array is a real answer, not a missing one: a teacher posted to no
 * rooms sees no rooms. Collapsing that to "unrestricted" is the exact bug this
 * module exists to prevent.
 */
export async function visibleClassroomIds(
  session: SessionPayload,
): Promise<string[] | null> {
  if (session.role === USER_ROLE.SUPER_ADMIN) return null;
  if (session.role === USER_ROLE.TEACHER) return taughtClassroomIds(session);
  return parentClassroomIds(session);
}

/** The filter to AND into any Classroom query. `{}` only for the super admin. */
export async function classroomScopeFilter(
  session: SessionPayload,
): Promise<Record<string, unknown>> {
  const ids = await visibleClassroomIds(session);
  return ids === null ? {} : { _id: { $in: ids } };
}

/**
 * Loads a room the caller is allowed to read, or throws.
 *
 * 404 rather than 403 for a room that exists but is not theirs, matching
 * `findStudentInScope` - "that room exists, you just cannot see it" leaks the
 * school's structure.
 *
 * Read-only. Taking the register is stricter and has its own gate:
 * `findClassroomToMark` in `attendanceScope.ts` requires the teacher be posted
 * to the room, where this one also admits a guardian with a child in it.
 */
export async function findClassroomInScope(
  session: SessionPayload,
  id: string,
): Promise<IClassroom> {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid classroom id.");
  }
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new ApiError(404, "Classroom not found.");

  if (session.role === USER_ROLE.SUPER_ADMIN) return classroom;

  /*
   * The teacher case is checked against the room in hand rather than by
   * re-listing their rooms: one query instead of two, and it reads as the
   * question being asked.
   */
  if (session.role === USER_ROLE.TEACHER) {
    const teacherId = await teacherProfileId(session);
    if (!teachesClassroom(teacherId, classroom)) {
      throw new ApiError(404, "Classroom not found.");
    }
    return classroom;
  }

  const mine = await parentClassroomIds(session);
  if (!mine.includes(String(classroom._id))) {
    throw new ApiError(404, "Classroom not found.");
  }
  return classroom;
}
