import { ApiError } from "@/lib/api";
import type { SessionPayload } from "@/lib/session";
import { Parent, Student } from "@/models";
import { USER_ROLE } from "@/models/enums";

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
 * Ids of every child this guardian is listed on.
 *
 * The raw ids rather than the documents, because every caller wants them for
 * an `$in` - the rooms their children sit in, the register lines that name
 * them, the gallery items they are tagged on.
 */
export async function guardedStudentIds(
  session: SessionPayload,
): Promise<string[]> {
  const parentId = await parentProfileId(session);
  const ids = await Student.find({ "guardians.parent": parentId }).distinct(
    "_id",
  );
  return ids.map(String);
}

/**
 * Extra filter to AND into a student query. Staff get everything; a guardian
 * gets only the children they are listed on.
 */
export async function studentScopeFilter(
  session: SessionPayload,
): Promise<Record<string, unknown>> {
  if (session.role !== USER_ROLE.PARENT) return {};
  return { "guardians.parent": await parentProfileId(session) };
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
 * A guardian adding their own child must appear on it, and may not enrol a
 * child solely against other people. Staff are free to set any list.
 */
export async function assertGuardianListAllowed(
  session: SessionPayload,
  guardians: { parent: string }[],
): Promise<void> {
  if (session.role !== USER_ROLE.PARENT) return;

  const own = await parentProfileId(session);
  if (!guardians.some((g) => g.parent === own)) {
    throw new ApiError(
      403,
      "You can only add a child with yourself listed as a guardian.",
      { guardians: "You must be one of this child's guardians." },
    );
  }
}
