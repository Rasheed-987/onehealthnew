import { ApiError } from "@/lib/api";
import { taughtClassroomIds } from "@/lib/classroomScope";
import type { AudienceInput } from "@/lib/notifications";
import type { SessionPayload } from "@/lib/session";
import { guardedStudentIds } from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Student } from "@/models";
import type { INotificationAudience } from "@/models";
import {
  ENROLLMENT_STATUS,
  NOTIFICATION_AUDIENCE,
  USER_ROLE,
} from "@/models/enums";

/**
 * The two halves of the audience: turning a rule into a filter, and checking a
 * rule before it is stored.
 *
 * `permissions.ts` says every role may `notification:list` - which is true, and
 * on its own useless: it would hand every guardian every notice in the
 * building. This module answers the row-level half, and it is the mirror image
 * of the composer. The composer asks "who is this for?"; this asks "is this
 * one for me?", and the two have to agree or a notice is written to an
 * audience that can never read it.
 */

/**
 * A notice this session is entitled to read.
 *
 * Written as an `$or` over the four kinds rather than as a branch per role,
 * because a reader can be reached by more than one arm at once - a teacher is
 * covered by ALL, by "all teachers", and by every room they are posted to -
 * and a notice matching two arms is still one notice.
 *
 * The super admin gets `{}`. They wrote these, and a table that hid rows from
 * their own author would make "did that send?" unanswerable.
 *
 * Note what a TEACHER is deliberately NOT reached by: `STUDENT`. A notice
 * addressed to named children is addressed to those children's homes - it is
 * the school speaking to a family - and a school that wants the room's staff
 * to see it addresses the room. Making it reach both would mean there is no
 * way to write to a family alone, which is the whole point of the kind.
 */
export async function resolveNotificationScope(
  session: SessionPayload,
): Promise<Record<string, unknown>> {
  if (session.role === USER_ROLE.SUPER_ADMIN) return {};

  const reachedBy: Record<string, unknown>[] = [
    { "audience.kind": NOTIFICATION_AUDIENCE.ALL },
    {
      "audience.kind": NOTIFICATION_AUDIENCE.ROLE,
      "audience.roles": session.role,
    },
  ];

  if (session.role === USER_ROLE.TEACHER) {
    reachedBy.push({
      "audience.kind": NOTIFICATION_AUDIENCE.CLASSROOM,
      // An empty array matches nothing, deliberately: a teacher posted to no
      // rooms is reached by no room notices. Same rule as every other scope.
      "audience.classrooms": { $in: await taughtClassroomIds(session) },
    });
  } else if (session.role === USER_ROLE.PARENT) {
    /*
     * A guardian's rooms are derived from their children rather than read
     * separately, so the enrolment and grace-period rules in `studentScope`
     * decide notification access too. A family whose child left in March stops
     * seeing that room's notices for the same reason they stop seeing its
     * registers.
     */
    const studentIds = await guardedStudentIds(session);
    const classroomIds =
      studentIds.length === 0
        ? []
        : (
            await Enrollment.find({
              student: { $in: studentIds },
              status: ENROLLMENT_STATUS.ACTIVE,
            }).distinct("classroom")
          ).map(String);

    reachedBy.push(
      {
        "audience.kind": NOTIFICATION_AUDIENCE.CLASSROOM,
        "audience.classrooms": { $in: classroomIds },
      },
      {
        "audience.kind": NOTIFICATION_AUDIENCE.STUDENT,
        "audience.students": { $in: studentIds },
      },
    );
  }

  // A withdrawn notice is gone for everyone but its author.
  return { isActive: true, $or: reachedBy };
}

/**
 * Checks a submitted audience and returns the subdocument to store.
 *
 * Zod has already established the SHAPE - one kind, the matching list, nothing
 * else. What is left is whether the things named actually exist, and that
 * cannot be answered without the database. It matters more here than on most
 * forms: an id that quietly does not resolve produces a notice addressed to
 * nobody, which looks exactly like a notice that was sent successfully.
 *
 * Rejected rather than silently dropped, for the same reason. "Two of these
 * five children are no longer enrolled" is something the sender needs to
 * decide about, not something a route should decide for them.
 */
export async function resolveAudience(
  input: AudienceInput,
): Promise<INotificationAudience> {
  const empty = { roles: [], classrooms: [], students: [] };

  if (input.kind === NOTIFICATION_AUDIENCE.ALL) {
    return { kind: input.kind, ...empty } as INotificationAudience;
  }

  if (input.kind === NOTIFICATION_AUDIENCE.ROLE) {
    // The enum did the work; there is nothing to look up.
    return {
      kind: input.kind,
      ...empty,
      roles: unique(input.roles),
    } as INotificationAudience;
  }

  if (input.kind === NOTIFICATION_AUDIENCE.CLASSROOM) {
    const ids = unique(input.classrooms);
    assertObjectIds(ids, "audience.classrooms", "classroom");

    const found = await Classroom.find({
      _id: { $in: ids },
      isActive: true,
    }).distinct("_id");
    assertAllFound(ids, found, "audience.classrooms", {
      one: "That classroom no longer exists.",
      many: "Some of those classrooms no longer exist.",
    });

    return {
      kind: input.kind,
      ...empty,
      classrooms: ids,
    } as unknown as INotificationAudience;
  }

  const ids = unique(input.students);
  assertObjectIds(ids, "audience.students", "student");

  const found = await Student.find({
    _id: { $in: ids },
    isActive: true,
  }).distinct("_id");
  assertAllFound(ids, found, "audience.students", {
    one: "That child is no longer on the roll.",
    many: "Some of those children are no longer on the roll.",
  });

  return {
    kind: input.kind,
    ...empty,
    students: ids,
  } as unknown as INotificationAudience;
}

/**
 * Ticking the same room twice is a double-click, not an error worth a 400 -
 * so it is folded here rather than rejected. The model still refuses a
 * duplicate that arrives some other way.
 */
function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.map(String))) as T[];
}

function assertObjectIds(
  ids: string[],
  path: string,
  noun: string,
): void {
  if (ids.every(isObjectId)) return;
  throw new ApiError(400, `That is not a valid ${noun} id.`, {
    [path]: `That is not a valid ${noun} id.`,
  });
}

function assertAllFound(
  asked: string[],
  found: unknown[],
  path: string,
  message: { one: string; many: string },
): void {
  const have = new Set(found.map(String));
  const missing = asked.filter((id) => !have.has(id));
  if (missing.length === 0) return;

  const text = missing.length === 1 ? message.one : message.many;
  throw new ApiError(400, text, { [path]: text });
}
