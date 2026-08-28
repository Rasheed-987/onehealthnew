import type { NextRequest } from "next/server";

import { handle, ok, requirePermission } from "@/lib/api";
import { escapeRegex } from "@/lib/teachers";
import { Parent, Student, User } from "@/models";
import { USER_ROLE } from "@/models/enums";

/**
 * Guardian search for the enrolment sheet's guardian picker.
 *
 * Separate from `GET /api/parents` on purpose. That route is gated on
 * `parent:update`, which teachers do not have - yet teachers can create
 * students, so they need to be able to name a guardian. This one is gated on
 * `student:create` instead and returns only what the picker needs: no address,
 * no occupation, no emergency contact.
 *
 * A search rather than the whole list. It used to dump 500 guardians as name
 * and email, which is unusable for the job actually being done: two families
 * called Mohammed Ali are indistinguishable that way, and picking the wrong one
 * hands a stranger another child's photos, clinical records and messages. So
 * each result carries the children already linked to it - staff recognise a
 * FAMILY, and the children are what tell two same-named guardians apart.
 *
 * `options` is a static segment, so it takes precedence over the sibling
 * `[id]` route rather than being read as a parent id.
 */

/** A picker shows a shortlist. Anything longer means the search was too vague. */
const MAX_RESULTS = 20;

export async function GET(request: NextRequest) {
  return handle(async () => {
    await requirePermission("student:create");

    const q = request.nextUrl.searchParams.get("q")?.trim();

    /*
     * An empty search returns the most recent few rather than nothing, so the
     * picker still opens usefully - the guardian you want is very often one
     * you added minutes ago, on the sibling you just enrolled.
     */
    let filter: Record<string, unknown> = {};
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      // Name, email and phone all live on User, so the match resolves to user
      // ids first. Phone is included because it is what a parent gives on the
      // telephone when they cannot spell their email.
      const userIds = await User.find({
        role: USER_ROLE.PARENT,
        $or: [
          { firstName: pattern },
          { lastName: pattern },
          { email: pattern },
          { phone: pattern },
        ],
      }).distinct("_id");
      filter = { user: { $in: userIds } };
    }

    const parents = await Parent.find(filter)
      .populate<{ user: InstanceType<typeof User> }>("user")
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS);

    // One query for the whole shortlist, served by the `{"guardians.parent": 1}`
    // index on Student.
    const parentIds = parents.map((parent) => parent._id);
    const students = await Student.find({
      "guardians.parent": { $in: parentIds },
    })
      .select("firstName lastName guardians")
      .sort({ firstName: 1 });

    const childrenByParent = new Map<string, { id: string; name: string }[]>();
    for (const student of students) {
      const entry = {
        id: String(student._id),
        name: `${student.firstName} ${student.lastName}`.trim(),
      };
      for (const guardian of student.guardians) {
        const key = String(guardian.parent);
        const list = childrenByParent.get(key);
        if (list) list.push(entry);
        else childrenByParent.set(key, [entry]);
      }
    }

    return ok({
      parents: parents
        .filter((parent) => parent.user)
        .map((parent) => ({
          id: String(parent._id),
          name: `${parent.user.firstName} ${parent.user.lastName}`.trim(),
          email: parent.user.email,
          phone: parent.user.phone ?? null,
          children: childrenByParent.get(String(parent._id)) ?? [],
        })),
    });
  });
}
