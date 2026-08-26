import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { UpdateGalleryItemSchema, hydrateGalleryRows } from "@/lib/gallery";
import { resolveAudience, resolveGalleryScope } from "@/lib/galleryScope";
import { isObjectId } from "@/lib/teachers";
import { GalleryItem } from "@/models";

/**
 * One gallery post.
 *
 * PUT lives here rather than on the collection, which is the opposite of the
 * daily sheet - and for a good reason. A sheet has a natural key
 * (`{ student, date }`), so writing it twice is the same write twice and PUT
 * is honest. A photo has no natural key: a retried `PUT /api/gallery` would
 * make a second post every time, which is exactly what PUT must not do. So
 * creation is POST on the collection, and PUT here edits a post that already
 * has an id.
 *
 * The media is not editable. A different photo is a different post; quietly
 * swapping the file under something guardians have already seen is not
 * something the school should be able to do.
 */

/** Loads a post the caller may act on, or 404s. */
async function findInScope(
  session: Awaited<ReturnType<typeof requirePermission>>,
  id: string,
) {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid gallery id.");
  }
  const scope = await resolveGalleryScope(session);
  // Scope in the query rather than a check after the read, so a post outside
  // it is indistinguishable from one that does not exist.
  const item = await GalleryItem.findOne({ _id: id, ...scope.filter });
  if (!item) throw new ApiError(404, "Gallery item not found.");
  return item;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/gallery/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("gallery:list");
    const { id } = await context.params;
    const item = await findInScope(session, id);

    const [row] = await hydrateGalleryRows([item]);
    return ok({ item: row });
  });
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/gallery/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("gallery:update");
    const { id } = await context.params;
    const item = await findInScope(session, id);
    const input = await parseBody(request, UpdateGalleryItemSchema);

    if (input.title !== undefined) item.title = input.title;
    if (input.description !== undefined) item.description = input.description;
    if (input.type !== undefined) item.type = input.type;
    if (input.takenAt !== undefined) item.takenAt = new Date(input.takenAt);
    if (input.isActive !== undefined) item.isActive = input.isActive;

    /*
     * Re-tagging changes who can read the post, so it goes back through the
     * same audience gate as creating one: every child must be seated, they
     * must share a room, and the caller must teach it.
     */
    if (input.students !== undefined) {
      const { students, classroom } = await resolveAudience(session, {
        students: input.students,
      });
      item.students = students.map(
        (s) => s as unknown as (typeof item.students)[number],
      );
      item.classroom = classroom._id;
    }

    // `save()` so the model's pre("validate") hook runs - it is what enforces
    // "at least one tag" and "no duplicate tags".
    await item.save();

    const [row] = await hydrateGalleryRows([item]);
    return ok({ item: row });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/gallery/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("gallery:delete");
    const { id } = await context.params;
    const item = await findInScope(session, id);

    /*
     * Soft delete. The row stays so a removed post drops out of guardian feeds
     * intact rather than leaving a hole, and so an accidental removal is
     * recoverable. The file on disk is deliberately left alone for the same
     * reason - `isActive: false` is reversible, unlinking the photo is not.
     */
    item.isActive = false;
    await item.save();

    return ok({ success: true });
  });
}
