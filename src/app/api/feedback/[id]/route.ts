import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { hydrateFeedbackRows, resolveFeedbackScope } from "@/lib/feedback";
import { isObjectId } from "@/lib/teachers";
import { Feedback } from "@/models";

/**
 * One piece of feedback.
 *
 * No PUT. A comment is a record of what a family thought on the day they wrote
 * it, and the only write after creation is the super admin taking a row out -
 * see the note on the model.
 */

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/feedback/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("feedback:list");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid feedback id.");
    }

    // Scope in the query rather than a check after the read, so another
    // family's comment is indistinguishable from one that does not exist.
    const feedback = await Feedback.findOne({
      _id: id,
      ...resolveFeedbackScope(session),
    });
    if (!feedback) throw new ApiError(404, "Feedback not found.");

    const [row] = await hydrateFeedbackRows([feedback]);
    return ok({ feedback: row });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/feedback/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("feedback:delete");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid feedback id.");
    }

    /*
     * A real delete, unlike the gallery's `isActive: false`. A removed photo
     * has to stay so the guardians who could see it are left with a feed that
     * still makes sense; a removed comment is read by nobody but the admin who
     * is removing it, so a soft delete would only mean spam accumulating
     * forever behind a flag.
     *
     * `feedback:delete` is admin-only, so the scope filter would always be
     * empty here - it is applied anyway, so that widening the permission later
     * cannot silently hand someone else's row to the wrong person.
     */
    const feedback = await Feedback.findOneAndDelete({
      _id: id,
      ...resolveFeedbackScope(session),
    });
    if (!feedback) throw new ApiError(404, "Feedback not found.");

    return ok({ success: true });
  });
}
