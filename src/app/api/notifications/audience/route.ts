import { handle, ok, requirePermission } from "@/lib/api";
import type {
  AudienceOptions,
  ClassroomOption,
  StudentGroup,
  StudentOption,
} from "@/lib/notifications";
import { Classroom, Enrollment, Parent, Student, Teacher, User } from "@/models";
import {
  ENROLLMENT_STATUS,
  GRADE_LEVEL_LABEL,
  NOTIFICATION_ROLE_TARGET,
  NOTIFICATION_ROLE_TARGET_LABEL,
  USER_ROLE,
  USER_STATUS,
} from "@/models/enums";

/**
 * Everything the "For" picker offers, grouped by the kind of audience it is.
 *
 * Follows the `options` convention used by students, teachers and parents: a
 * small, purpose-built payload for a picker, gated on the permission needed to
 * ACT on it (`notification:create`) rather than the one needed to read the
 * board - so nobody but the sender can use this to enumerate the school.
 *
 * The reason it exists at all is the shape of the old form, which put "All",
 * "Parent", "Teacher" and every individual teacher into one flat multi-select.
 * That list gets longer every time the school hires or enrols somebody, it
 * offers combinations that mean nothing ("All" plus one teacher), and it makes
 * the sender guess how far a choice reaches. So the four kinds are returned as
 * four separate groups, each option carries its own reach, and children are
 * grouped by the room they sit in - which is how staff already think of them.
 *
 * Reach counts exclude SUSPENDED accounts and include INVITED ones: somebody
 * who has not set their password yet will read the notice when they do, and
 * counting them is the difference between "why did 3 families miss this" being
 * answerable now or after the fact.
 */

/**
 * How many children the picker will list. A nursery is nowhere near this, and
 * a school that is has outgrown a ticklist and wants a search box - which is
 * a change to this route, not a silently truncated list today.
 */
const MAX_STUDENTS = 1000;

export async function GET() {
  return handle(async () => {
    await requirePermission("notification:create");

    const [classrooms, students, reachableStaff, reachableParents] =
      await Promise.all([
        Classroom.find({ isActive: true }).sort({ name: 1 }),
        Student.find({ isActive: true })
          .sort({ firstName: 1, lastName: 1 })
          .limit(MAX_STUDENTS),
        User.find({
          role: USER_ROLE.TEACHER,
          status: { $ne: USER_STATUS.SUSPENDED },
        }).distinct("_id"),
        User.find({
          role: USER_ROLE.PARENT,
          status: { $ne: USER_STATUS.SUSPENDED },
        }).distinct("_id"),
      ]);

    const reachableStaffIds = new Set(reachableStaff.map(String));
    const reachableParentIds = new Set(reachableParents.map(String));

    /*
     * A child names guardians by Parent profile, but reach is a property of
     * the User behind that profile - so the two have to be walked in one hop
     * for the whole roll rather than per child.
     */
    const parentIds = Array.from(
      new Set(
        students.flatMap((s) => (s.guardians ?? []).map((g) => String(g.parent))),
      ),
    );
    const parents = await Parent.find({ _id: { $in: parentIds } }).select(
      "user",
    );
    const userIdByParent = new Map(
      parents.map((p) => [String(p._id), String(p.user)]),
    );

    // Names for the picker, so two children called Yusuf can be told apart by
    // whose they are. Fetched for every guardian, reachable or not - a
    // suspended parent is still the child's parent on the card.
    const guardianUsers = await User.find({
      _id: { $in: Array.from(new Set(userIdByParent.values())) },
    }).select("firstName lastName");
    const guardianNameById = new Map(
      guardianUsers.map((u) => [
        String(u._id),
        `${u.firstName} ${u.lastName}`.trim(),
      ]),
    );

    /** The guardian User ids behind one child, deduped. */
    const guardianUserIds = (guardians: string[]) =>
      Array.from(
        new Set(
          guardians
            .map((parentId) => userIdByParent.get(parentId))
            .filter((id): id is string => Boolean(id)),
        ),
      );

    const enrolments = await Enrollment.find({
      student: { $in: students.map((s) => s._id) },
      status: ENROLLMENT_STATUS.ACTIVE,
    }).select("student classroom");
    const classroomByStudent = new Map(
      enrolments.map((e) => [String(e.student), String(e.classroom)]),
    );

    // Which staff accounts a room's postings actually reach.
    const teacherIds = Array.from(
      new Set(classrooms.flatMap((c) => c.teachers.map((t) => String(t.teacher)))),
    );
    const teacherProfiles = await Teacher.find({
      _id: { $in: teacherIds },
    }).select("user");
    const userIdByTeacher = new Map(
      teacherProfiles.map((t) => [String(t._id), String(t.user)]),
    );

    const studentOptions = new Map<string, StudentOption>();
    for (const student of students) {
      const id = String(student._id);
      const guardians = (student.guardians ?? []).map((g) => String(g.parent));
      const userIds = guardianUserIds(guardians);

      studentOptions.set(id, {
        id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        guardians: userIds
          .map((userId) => guardianNameById.get(userId))
          .filter((name): name is string => Boolean(name)),
        recipients: userIds.filter((userId) => reachableParentIds.has(userId))
          .length,
      });
    }

    const classroomOptions: ClassroomOption[] = classrooms.map((room) => {
      const roomId = String(room._id);
      const seated = students.filter(
        (s) => classroomByStudent.get(String(s._id)) === roomId,
      );

      /*
       * Distinct guardian ACCOUNTS, not guardian entries: two siblings in the
       * same room share their parents, and counting the entries would tell the
       * sender this notice reaches four families when it reaches two.
       */
      const families = new Set<string>();
      for (const student of seated) {
        for (const userId of guardianUserIds(
          (student.guardians ?? []).map((g) => String(g.parent)),
        )) {
          if (reachableParentIds.has(userId)) families.add(userId);
        }
      }

      const staff = new Set<string>();
      for (const posting of room.teachers) {
        const userId = userIdByTeacher.get(String(posting.teacher));
        if (userId && reachableStaffIds.has(userId)) staff.add(userId);
      }

      return {
        id: roomId,
        name: room.name,
        gradeLabel: GRADE_LEVEL_LABEL[room.gradeLevel],
        roomNumber: room.roomNumber ?? null,
        students: seated.length,
        families: families.size,
        staff: staff.size,
      };
    });

    /*
     * Children under the room they sit in, in the same order the rooms are
     * listed, with the unseated ones last. Grouping here rather than in the
     * component keeps one definition of "which room is this child in" - the
     * ACTIVE enrolment - shared with the counts above.
     */
    const groups: StudentGroup[] = classrooms.map((room) => ({
      classroom: { id: String(room._id), name: room.name },
      students: students
        .filter((s) => classroomByStudent.get(String(s._id)) === String(room._id))
        .map((s) => studentOptions.get(String(s._id))!),
    }));

    const unseated = students
      .filter((s) => !classroomByStudent.has(String(s._id)))
      .map((s) => studentOptions.get(String(s._id))!);
    if (unseated.length > 0) {
      groups.push({ classroom: null, students: unseated });
    }

    const recipientsByRole: Record<string, number> = {
      [USER_ROLE.PARENT]: reachableParentIds.size,
      [USER_ROLE.TEACHER]: reachableStaffIds.size,
    };

    const options: AudienceOptions = {
      everyone: {
        families: reachableParentIds.size,
        staff: reachableStaffIds.size,
      },
      roles: NOTIFICATION_ROLE_TARGET.map((role) => ({
        value: role,
        label: NOTIFICATION_ROLE_TARGET_LABEL[role],
        recipients: recipientsByRole[role] ?? 0,
      })),
      classrooms: classroomOptions,
      // Rooms with nobody in them are still worth listing above - a notice can
      // be pinned to a room before it fills - but an empty group here is just
      // a heading with nothing under it.
      studentGroups: groups.filter((group) => group.students.length > 0),
    };

    return ok(options);
  });
}
