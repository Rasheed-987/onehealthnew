import { ApiError } from "@/lib/api";
import type { SessionPayload } from "@/lib/session";
import type { GuardianInput } from "@/lib/students";
import { Enrollment, Parent, Student } from "@/models";
import {
  ENROLLMENT_STATUS,
  GUARDIAN_ACCESS_GRACE_MS,
  USER_ROLE,
} from "@/models/enums";

/**
 * Row-level scoping for students.
 *
 * `permissions.ts` answers "may this role touch students at all". These
 * functions answer the harder half - "may this parent touch THIS child" - and
 * every student route calls one of them after the role check. A guardian who
 * can list students must not thereby be able to read the whole school.
 */

/** The Parent profile behind a signed-in guardian. */
export async function parentProfileId(session: SessionPayload): Promise<string> {
  const parent = await Parent.findOne({ user: session.userId });
  if (!parent) {
    throw new ApiError(
      403,
      "Your guardian profile is missing, so no children can be linked to you.",
    );
  }
  return String(parent._id);
}

/**
 * Ids of every child this guardian may currently read.
 *
 * The raw ids rather than the documents, because every caller wants them for
 * an `$in` - the rooms their children sit in, the register lines that name
 * them, the gallery items they are tagged on.
 *
 * Being listed on a child is necessary but NOT sufficient. This used to return
 * the guardian list alone, which meant access never ended: a child who
 * withdrew in March left their guardian able to read that room's registers,
 * daily sheets, clinical visits, gallery and messages indefinitely. A guardian
 * now sees a child only while the school still has them:
 *
 *   no enrolment at all  visible - just added, nobody has seated them yet
 *   an ACTIVE enrolment  visible - the ordinary case
 *   closed recently      visible - the grace window, see the note on the
 *                        constant; the family is downloading their photos
 *   closed long ago      hidden
 *
 * The first branch is load-bearing. Without it a child the school has just
 * enrolled is invisible to their guardian until someone puts them in a room,
 * which reads as the app having lost the child.
 */
export async function guardedStudentIds(
  session: SessionPayload,
): Promise<string[]> {
  const parentId = await parentProfileId(session);
  const linked = (
    await Student.find({ "guardians.parent": parentId }).distinct("_id")
  ).map(String);
  if (linked.length === 0) return [];

  /*
   * One query rather than an "ever seated" and a "still live" pair: a
   * guardian's children have a handful of enrolment rows between them, so
   * deciding it in memory is cheaper than a second round trip.
   */
  const enrolments = await Enrollment.find({ student: { $in: linked } })
    .select("student status endedAt")
    .lean();

  const cutoff = new Date(Date.now() - GUARDIAN_ACCESS_GRACE_MS);
  const seated = new Set<string>();
  const live = new Set<string>();
  for (const row of enrolments) {
    const id = String(row.student);
    seated.add(id);
    if (
      row.status === ENROLLMENT_STATUS.ACTIVE ||
      (row.endedAt && row.endedAt >= cutoff)
    ) {
      live.add(id);
    }
  }

  return linked.filter((id) => !seated.has(id) || live.has(id));
}

/**
 * Extra filter to AND into a student query. Staff get everything; a guardian
 * gets only the children they may currently read.
 *
 * Resolved through `guardedStudentIds` rather than by matching
 * `"guardians.parent"` directly, so the enrolment rule above lives in exactly
 * one place. A guardian whose children have all left yields `{ $in: [] }`,
 * which matches nothing - deliberately, as everywhere else in the scope layer.
 */
export async function studentScopeFilter(
  session: SessionPayload,
): Promise<Record<string, unknown>> {
  if (session.role !== USER_ROLE.PARENT) return {};
  return { _id: { $in: await guardedStudentIds(session) } };
}

/**
 * Loads a student the caller is allowed to see, or throws.
 *
 * Deliberately 404 rather than 403 for a child that exists but is not theirs:
 * telling a stranger "that student exists, you just cannot see them" leaks the
 * roll.
 */
export async function findStudentInScope(
  session: SessionPayload,
  id: string,
) {
  const scope = await studentScopeFilter(session);
  const student = await Student.findOne({ _id: id, ...scope });
  if (!student) throw new ApiError(404, "Student not found.");
  return student;
}

/**
 * Refuses a guardian-authored enrolment list.
 *
 * Unreachable as it stands: `student:create` is staff-only, so a guardian is
 * turned away by the role gate before the body is ever read. It is kept as the
 * second layer, because the thing it stops is not obvious from the route -
 * a guardian who could POST a student could invent a child and name any
 * `Parent` id as its guardian, and that stranger would then see the invented
 * child in their own app. If a parent is ever given `student:create` back, the
 * rule that has to come with it already exists here.
 *
 * Staff are unaffected and free to set any list.
 */
export async function assertGuardianListAllowed(
  session: SessionPayload,
  guardians: GuardianInput[],
): Promise<void> {
  if (session.role !== USER_ROLE.PARENT) return;

  const own = await parentProfileId(session);
  const [only] = guardians;
  const isOnlySelf =
    guardians.length === 1 &&
    only.kind === "existing" &&
    only.parent === own;

  if (!isOnlySelf) {
    throw new ApiError(
      403,
      "You can only add a child with yourself as the sole guardian. Ask the school to add anyone else.",
      { guardians: "List only yourself here." },
    );
  }
}

/**
 * Changing an existing child's guardian list is staff-only.
 *
 * Unlike `assertGuardianListAllowed` this one is live: a guardian still holds
 * `student:update`, so they reach this route to correct their own child's
 * details. The school owns who is on a child - a guardian must not be able to
 * remove the co-guardian the school added, because losing access to your own
 * child's record is not something a form should be able to do by accident.
 *
 * It refuses a CHANGE rather than the field's mere presence. The student form
 * is one form for every role and always submits the complete list, so a parent
 * correcting their child's spelling sends the guardians back untouched - and
 * refusing that would block them from editing their own child at all.
 */
export function assertGuardianEditAllowed(
  session: SessionPayload,
  current: readonly { parent: unknown; relationship: string }[],
  submitted: readonly GuardianInput[],
): void {
  if (session.role !== USER_ROLE.PARENT) return;

  const key = (parent: string, relationship: string) =>
    `${parent}:${relationship}`;
  const before = new Set(
    current.map((g) => key(String(g.parent), g.relationship)),
  );
  // A `new` row is a change by definition - it names somebody with no account.
  const after = submitted.map((g) =>
    g.kind === "existing" ? key(g.parent, g.relationship) : null,
  );

  const unchanged =
    after.length === before.size &&
    after.every((entry) => entry !== null && before.has(entry));

  if (!unchanged) {
    throw new ApiError(
      403,
      "Only the school can change who a child's guardians are.",
      { guardians: "Ask the school to change this." },
    );
  }
}
