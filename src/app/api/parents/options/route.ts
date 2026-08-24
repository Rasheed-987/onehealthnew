import { handle, ok, requirePermission } from "@/lib/api";
import { Parent, User } from "@/models";

/**
 * A minimal parent list for the guardian picker on the student form.
 *
 * Separate from `GET /api/parents` on purpose. That route is gated on
 * `parent:update`, which teachers do not have - yet teachers can create
 * students, so they need to be able to name a guardian. This one is gated on
 * `student:create` instead and returns only what a dropdown needs: no address,
 * no occupation, no emergency contact.
 *
 * `options` is a static segment, so it takes precedence over the sibling
 * `[id]` route rather than being read as a parent id.
 */
export async function GET() {
  return handle(async () => {
    await requirePermission("student:create");

    const parents = await Parent.find()
      .populate<{ user: InstanceType<typeof User> }>("user")
      .sort({ createdAt: -1 })
      // A nursery has hundreds of guardians at most; a dropdown that needed
      // more than this would need to be a search field instead.
      .limit(500);

    return ok({
      parents: parents
        .filter((parent) => parent.user)
        .map((parent) => ({
          id: String(parent._id),
          name: `${parent.user.firstName} ${parent.user.lastName}`.trim(),
          email: parent.user.email,
        })),
    });
  });
}
