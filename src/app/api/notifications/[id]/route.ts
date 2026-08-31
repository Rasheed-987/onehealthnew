import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  UpdateNotificationSchema,
  hydrateNotificationRows,
} from "@/lib/notifications";
import {
  resolveAudience,
  resolveNotificationScope,
} from "@/lib/notificationScope";
import { isObjectId } from "@/lib/teachers";
import { Notification } from "@/models";

/**
 * One announcement.
 *
 * PUT lives here rather than on the collection for the same reason as the
 * gallery: a notice has no natural key, so a retried `PUT /api/notifications`
 * would post a second one every time. Creation is POST on the collection, and
 * PUT here edits a notice that already has an id.
 */

/** Loads a notice the caller may act on, or 404s. */
async function findInScope(
  session: Awaited<ReturnType<typeof requirePermission>>,
  id: string,
) {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid notification id.");
  }
  const scope = await resolveNotificationScope(session);
  // Scope in the query rather than a check after the read, so a notice that is
  // not addressed to the caller is indistinguishable from one that is not there.
  const notification = await Notification.findOne({ _id: id, ...scope });
  if (!notification) throw new ApiError(404, "Notification not found.");
  return notification;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/notifications/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("notification:list");
    const { id } = await context.params;
    const notification = await findInScope(session, id);

    const [row] = await hydrateNotificationRows([notification]);
    return ok({ notification: row });
  });
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<"/api/notifications/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("notification:update");
    const { id } = await context.params;
    const notification = await findInScope(session, id);
    const input = await parseBody(request, UpdateNotificationSchema);

    if (input.title !== undefined) notification.title = input.title;
    if (input.body !== undefined) notification.body = input.body;
    if (input.isActive !== undefined) notification.isActive = input.isActive;

    /*
     * Re-addressing changes who can read it, so it goes back through the same
     * gate as writing one: the kind decides the list, and everything named has
     * to still exist. Assigning the whole subdocument - rather than patching
     * the arrays - is what clears the previous kind's selection.
     */
    if (input.audience !== undefined) {
      notification.audience = await resolveAudience(input.audience);
    }

    // `save()` so the model's pre("validate") hook runs.
    await notification.save();

    const [row] = await hydrateNotificationRows([notification]);
    return ok({ notification: row });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/notifications/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("notification:delete");
    const { id } = await context.params;
    const notification = await findInScope(session, id);

    /*
     * Soft delete, like the gallery. It drops out of every reader's board at
     * once - `isActive: true` is pinned into their scope - while the row stays
     * so the school can answer "what did we announce, and when", and so a
     * notice pulled by mistake can be put back with a PUT.
     */
    notification.isActive = false;
    await notification.save();

    return ok({ success: true });
  });
}
