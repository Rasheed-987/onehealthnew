import { ApiError } from "@/lib/api";
import {
  taughtStudentIds,
  teacherProfileId,
} from "@/lib/classroomScope";
import { isGuardianOf, teachesClassroom } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";
import { guardedStudentIds, parentProfileId } from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, MessageThread, Student } from "@/models";
import type { IClassroom, IMessageThread, IStudent } from "@/models";
import { USER_ROLE } from "@/models/enums";

/**
 * Who may read which conversation, and who may start one.
 *
 * Same shape as `galleryScope.ts` and `classroomScope.ts` - a plain Mongo
 * filter to AND into the query, never a boolean checked after the read - but
 * the filter is unusually simple here, because the thread key *is* the access
 * rule:
 *
 *   SUPER_ADMIN  every thread, read-only (see `assertCanPost`)
 *   TEACHER      { teacher: their profile id }
 *   PARENT       { student: { $in: their children } }
 *
 * A teacher is scoped by `teacher` rather than by classroom deliberately.
 * Scoping on the room would silently delete a teacher's conversation history
 * the day they were moved, which is the opposite of what a record of what the
 * school told a family is for.
 */

export interface ThreadScope {
  filter: Record<string, unknown>;
}

export async function resolveThreadScope(
  session: SessionPayload,
): Promise<ThreadScope> {
  if (session.role === USER_ROLE.SUPER_ADMIN) return { filter: {} };

  if (session.role === USER_ROLE.TEACHER) {
    return { filter: { teacher: await teacherProfileId(session) } };
  }

  /*
   * A guardian with no children yields `{ $in: [] }`, which matches nothing -
   * deliberately. Collapsing that to `{}` would hand them every conversation in
   * the school.
   */
  return { filter: { student: { $in: await guardedStudentIds(session) } } };
}

/**
 * Loads a thread the caller is allowed to read, or throws.
 *
 * 404 rather than 403 for a thread that exists but is not theirs, matching
 * `findStudentInScope` and `findClassroomInScope`. Here the leak would be
 * particularly unpleasant - "that conversation exists, you just cannot read it"
 * tells one family that another family has been talking to the school.
 */
export async function findThreadInScope(
  session: SessionPayload,
  id: string,
): Promise<IMessageThread> {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid conversation id.");
  }
  const { filter } = await resolveThreadScope(session);
  const thread = await MessageThread.findOne({ _id: id, ...filter });
  if (!thread) throw new ApiError(404, "Conversation not found.");
  return thread;
}

/**
 * Whether the caller may add to a conversation they can already read.
 *
 * Two separate refusals. The super admin is out by the permission table and is
 * given a reason rather than a bare 403, because from their side the thread
 * looks perfectly writable. Everyone else has to still be a participant - a
 * teacher must be *this* thread's teacher, a guardian must still be listed on
 * the child.
 *
 * Note what is NOT checked: whether the child is still enrolled in that
 * teacher's room. Once a conversation is open it stays open, so a transfer
 * mid-exchange does not strand an unanswered question from a family. Starting a
 * new one is stricter - see `resolvePair`.
 */
export async function assertCanPost(
  session: SessionPayload,
  thread: IMessageThread,
): Promise<void> {
  if (session.role === USER_ROLE.SUPER_ADMIN) {
    throw new ApiError(
      403,
      "This conversation is between the teacher and the child's guardians. You can read it, but a reply has to come from one of them.",
    );
  }

  if (session.role === USER_ROLE.TEACHER) {
    const teacherId = await teacherProfileId(session);
    if (String(thread.teacher) !== teacherId) {
      throw new ApiError(404, "Conversation not found.");
    }
    return;
  }

  const student = await Student.findById(thread.student);
  const parentId = await parentProfileId(session);
  if (!student || !isGuardianOf(parentId, student)) {
    throw new ApiError(404, "Conversation not found.");
  }
}

/**
 * The gate on *starting* a conversation, for both directions.
 *
 * A thread may only exist between a child and a teacher who actually teaches
 * that child right now. Both sides arrive here: a teacher naming one of their
 * students, and a guardian naming one of their child's teachers. Resolving them
 * through one function is what stops the two routes drifting into two different
 * ideas of who is allowed to talk to whom.
 */
export async function resolvePair(
  session: SessionPayload,
  input: { student: string; teacher?: string },
): Promise<{ student: IStudent; teacherId: string; classroom: IClassroom }> {
  if (!isObjectId(input.student)) {
    throw new ApiError(400, "That is not a valid student id.");
  }
  if (input.teacher !== undefined && !isObjectId(input.teacher)) {
    throw new ApiError(400, "That is not a valid teacher id.");
  }

  const student = await findStudentToMessage(session, input.student);

  // The child's current room is what decides which teachers they have.
  const enrolment = await Enrollment.currentFor(student._id);
  if (!enrolment) {
    throw new ApiError(
      400,
      "This child is not in a classroom yet, so there is no teacher to message.",
      { student: "This child has not been placed in a classroom." },
    );
  }

  const classroom = await Classroom.findById(enrolment.classroom);
  if (!classroom) throw new ApiError(404, "Classroom not found.");

  /*
   * A teacher may only open a thread as themselves. Opening one on a
   * colleague's behalf would put a conversation in that colleague's inbox that
   * they never agreed to have, under their name - which also means the field
   * may simply be omitted: there is only one answer it could hold.
   */
  if (session.role === USER_ROLE.TEACHER) {
    const own = await teacherProfileId(session);
    if (input.teacher !== undefined && input.teacher !== own) {
      throw new ApiError(
        403,
        "You can only start a conversation as yourself.",
        { teacher: "You can only message as yourself." },
      );
    }
    if (!own || !teachesClassroom(own, classroom)) {
      throw new ApiError(
        404,
        "You are not assigned to this child's classroom.",
        { teacher: "You are not assigned to this child's classroom." },
      );
    }
    return { student, teacherId: own, classroom };
  }

  /*
   * A guardian may omit the teacher only when the room leaves no choice to
   * make. With several teachers, defaulting silently (even to the lead) would
   * start a conversation with someone the family never picked.
   */
  const teacherId =
    input.teacher ??
    (classroom.teachers.length === 1
      ? String(classroom.teachers[0].teacher)
      : undefined);
  if (!teacherId) {
    throw new ApiError(
      400,
      "This child has more than one teacher, so choose who to message.",
      { teacher: "Choose one of this child's teachers." },
    );
  }

  if (!teachesClassroom(teacherId, classroom)) {
    throw new ApiError(
      404,
      "That teacher is not assigned to this child's classroom.",
      { teacher: "Choose one of this child's teachers." },
    );
  }

  return { student, teacherId, classroom };
}

/**
 * The child a new conversation is about, gated on the caller.
 *
 * A guardian's list is the children they are listed on; a teacher's is the
 * children currently seated in their rooms. 404 for anyone else's child, again
 * rather than 403.
 */
async function findStudentToMessage(
  session: SessionPayload,
  studentId: string,
): Promise<IStudent> {
  if (session.role === USER_ROLE.TEACHER) {
    const mine = await taughtStudentIds(session);
    if (!mine.includes(studentId)) throw new ApiError(404, "Student not found.");
  } else {
    const mine = await guardedStudentIds(session);
    if (!mine.includes(studentId)) throw new ApiError(404, "Student not found.");
  }

  const student = await Student.findById(studentId);
  if (!student) throw new ApiError(404, "Student not found.");
  return student;
}
