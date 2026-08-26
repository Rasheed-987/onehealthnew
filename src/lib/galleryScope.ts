import { ApiError } from "@/lib/api";
import { taughtClassroomIds, teacherProfileId } from "@/lib/classroomScope";
import { teachesClassroom } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/session";
import { guardedStudentIds } from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Student } from "@/models";
import type { IClassroom } from "@/models";
import {
  CLASSROOM_TEACHER_ROLE,
  ENROLLMENT_STATUS,
  USER_ROLE,
} from "@/models/enums";

/**
 * Who may see which gallery item, and who may post one.
 *
 * The gallery does NOT use `recordScope`. Attendance and daily progress are
 * one row per child per day with a single `student` field; a gallery item has
 * an ARRAY of tagged children, and that array is the audience. So a guardian's
 * filter is `{ students: { $in: mine } }` - an array-contains match, served by
 * the `{ students, isActive, createdAt }` index - not `{ student: { $in } }`.
 * Sharing the other module would have quietly matched nothing.
 */

export interface GalleryScope {
  filter: Record<string, unknown>;
  classroomIds: string[] | null;
}

export async function resolveGalleryScope(
  session: SessionPayload,
): Promise<GalleryScope> {
  if (session.role === USER_ROLE.SUPER_ADMIN) {
    return { filter: {}, classroomIds: null };
  }

  if (session.role === USER_ROLE.TEACHER) {
    const classroomIds = await taughtClassroomIds(session);
    // A teacher on no rooms yields `{ $in: [] }`, which matches nothing -
    // deliberately. Collapsing that to `{}` would hand them the whole school.
    return { filter: { classroom: { $in: classroomIds } }, classroomIds };
  }

  /*
   * The guardian feed. `isActive` is pinned here rather than left to the route
   * because a soft-deleted post must disappear from the home even though staff
   * can still see it - the whole point of the soft delete.
   */
  const studentIds = await guardedStudentIds(session);
  return {
    filter: { students: { $in: studentIds }, isActive: true },
    classroomIds: null,
  };
}

/**
 * Turns "this classroom" or "these children" into the explicit tag list that
 * becomes the audience, and checks the caller is allowed to post it.
 *
 * Returns the room as well, which is stored on the item as a filing label.
 *
 * Every tagged child must sit in ONE classroom. That is not an arbitrary
 * restriction: `classroom` is what a teacher's read scope filters on, so an
 * item spanning two rooms would be visible in one teacher's list and invisible
 * in the other's, for the same photo.
 */
export async function resolveAudience(
  session: SessionPayload,
  input: { students?: string[]; classroom?: string },
): Promise<{ students: string[]; classroom: IClassroom }> {
  if (input.classroom) {
    const classroom = await findPostableClassroom(session, input.classroom);

    // Expanded now, not resolved on read - see the note on AudienceSchema.
    const seated = await Enrollment.find({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    }).distinct("student");

    if (seated.length === 0) {
      throw new ApiError(
        400,
        "There are no children in that classroom yet, so nobody would see this.",
      );
    }
    return { students: seated.map(String), classroom };
  }

  const ids = input.students ?? [];
  /*
   * CreateGalleryItemSchema already refuses an empty audience, so this is
   * belt-and-braces for any other caller - without it the "no children" path
   * falls through every check below and dereferences `enrolments[0]`, turning
   * a bad request into a 500.
   */
  if (ids.length === 0) {
    throw new ApiError(
      400,
      "Tag at least one child - the tags decide who can see this.",
      { students: "Tag at least one child." },
    );
  }

  const bad = ids.find((id) => !isObjectId(id));
  if (bad) throw new ApiError(400, "That is not a valid student id.");

  const unique = Array.from(new Set(ids));
  const students = await Student.find({ _id: { $in: unique } });
  if (students.length !== unique.length) {
    throw new ApiError(404, "Student not found.");
  }

  const enrolments = await Enrollment.find({
    student: { $in: unique },
    status: ENROLLMENT_STATUS.ACTIVE,
  });
  if (enrolments.length !== unique.length) {
    throw new ApiError(
      400,
      "Every child on a post must be in a classroom. One of these is not seated yet.",
    );
  }

  const rooms = new Set(enrolments.map((e) => String(e.classroom)));
  if (rooms.size > 1) {
    throw new ApiError(
      400,
      "Tag children from one classroom at a time - a post belongs to a single room.",
    );
  }

  const classroom = await findPostableClassroom(
    session,
    String(enrolments[0].classroom),
  );
  return { students: unique, classroom };
}

/** The room a post is being filed under, gated on the caller. */
async function findPostableClassroom(
  session: SessionPayload,
  classroomId: string,
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
      "You can only post photos for a classroom you are assigned to.",
    );
  }
  return classroom;
}

/**
 * The Teacher credited on the post.
 *
 * The model requires one, and a super admin has no Teacher profile of their
 * own - so an admin posting to a room credits that room's lead teacher, which
 * is who the guardians would expect to see named anyway. An explicit
 * `teacher` in the body wins over both.
 */
export async function resolveCreditedTeacher(
  session: SessionPayload,
  classroom: IClassroom,
  explicit?: string,
): Promise<string> {
  if (explicit) {
    if (!isObjectId(explicit)) {
      throw new ApiError(400, "That is not a valid teacher id.");
    }
    return explicit;
  }

  if (session.role === USER_ROLE.TEACHER) return teacherProfileId(session);

  const lead = classroom.teachers.find(
    (t) => t.role === CLASSROOM_TEACHER_ROLE.LEAD,
  );
  if (!lead) {
    throw new ApiError(
      400,
      "That classroom has no class teacher, so name the teacher to credit.",
      { teacher: "Choose a teacher to credit." },
    );
  }
  return String(lead.teacher);
}
