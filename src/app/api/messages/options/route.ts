import { handle, ok, requirePermission } from "@/lib/api";
import { taughtStudentIds, teacherProfileId } from "@/lib/classroomScope";
import { teacherLabelsFor, type MessageRecipientRow } from "@/lib/messages";
import { guardedStudentIds } from "@/lib/studentScope";
import { Classroom, Enrollment, MessageThread, Student } from "@/models";
import { CLASSROOM_TEACHER_ROLE, ENROLLMENT_STATUS, USER_ROLE } from "@/models/enums";

/**
 * Who the caller is allowed to start a conversation with.
 *
 * Follows the `options` convention used by students, teachers and parents: a
 * small, purpose-built payload for a picker, gated on the permission that would
 * be needed to act on it (`message:send`, not `message:list`) - so a super
 * admin, who may read every thread but start none, gets an empty list rather
 * than a roster they cannot use.
 *
 * One shape serves both directions. A guardian picks a child and then one of
 * that child's teachers; a teacher picks a child and the `teachers` array holds
 * only themselves, because `resolvePair` refuses to open a thread in a
 * colleague's name. Existing threads come back as `threadId`, so the picker can
 * open the conversation that is already there instead of asking for a second
 * one.
 */

export async function GET() {
  return handle(async () => {
    const session = await requirePermission("message:send");

    const isTeacher = session.role === USER_ROLE.TEACHER;
    const studentIds = isTeacher
      ? await taughtStudentIds(session)
      : await guardedStudentIds(session);

    if (studentIds.length === 0) {
      return ok({ role: session.role, students: [] });
    }

    const ownTeacherId = isTeacher ? await teacherProfileId(session) : null;

    const [students, enrolments] = await Promise.all([
      Student.find({ _id: { $in: studentIds } }).sort({
        firstName: 1,
        lastName: 1,
      }),
      Enrollment.find({
        student: { $in: studentIds },
        status: ENROLLMENT_STATUS.ACTIVE,
      }),
    ]);

    const classroomByStudent = new Map(
      enrolments.map((e) => [String(e.student), String(e.classroom)]),
    );
    const classrooms = await Classroom.find({
      _id: { $in: Array.from(new Set(classroomByStudent.values())) },
    });
    const classroomMap = new Map(classrooms.map((c) => [String(c._id), c]));

    /*
     * The teacher each child could be talked to about. For a guardian that is
     * the child's whole room - lead first, since that is who a family means by
     * "the teacher". For a teacher it is only themselves.
     */
    const candidates = new Map<string, string[]>();
    for (const student of students) {
      const classroom = classroomMap.get(
        classroomByStudent.get(String(student._id)) ?? "",
      );
      if (!classroom) continue;

      if (ownTeacherId) {
        candidates.set(String(student._id), [ownTeacherId]);
        continue;
      }

      const ordered = [...classroom.teachers]
        .sort((a, b) =>
          a.role === CLASSROOM_TEACHER_ROLE.LEAD
            ? -1
            : b.role === CLASSROOM_TEACHER_ROLE.LEAD
              ? 1
              : 0,
        )
        .map((t) => String(t.teacher));
      candidates.set(String(student._id), ordered);
    }

    const teacherIds = Array.from(
      new Set(Array.from(candidates.values()).flat()),
    );

    const [labels, threads] = await Promise.all([
      teacherLabelsFor(teacherIds),
      MessageThread.find({
        student: { $in: studentIds },
        teacher: { $in: teacherIds },
      }),
    ]);

    const threadByPair = new Map(
      threads.map((t) => [`${String(t.student)}:${String(t.teacher)}`, String(t._id)]),
    );

    const rows: MessageRecipientRow[] = students.map((student) => {
      const id = String(student._id);
      const classroom = classroomMap.get(classroomByStudent.get(id) ?? "");

      return {
        id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        classroom: classroom
          ? { id: String(classroom._id), name: classroom.name }
          : null,
        teachers: (candidates.get(id) ?? []).map((teacherId) => ({
          id: teacherId,
          label: labels.get(teacherId) ?? "Unknown",
          threadId: threadByPair.get(`${id}:${teacherId}`) ?? null,
        })),
      };
    });

    return ok({ role: session.role, students: rows });
  });
}
