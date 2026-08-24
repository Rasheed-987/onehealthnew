import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { adminDisplayName, sendAccessEmail } from "@/lib/accountAccess";
import { isObjectId } from "@/lib/teachers";
import { Parent, User } from "@/models";

/**
 * Re-sends whichever access email this guardian needs - an invitation if they
 * have never set a password, a reset if they have lost one. The decision and
 * the sending both live in `accountAccess`, shared with the teachers route.
 */
export async function POST(
  _request: NextRequest,
  context: RouteContext<"/api/parents/[id]/invite">,
) {
  return handle(async () => {
    const session = await requirePermission("parent:update");
    const { id } = await context.params;

    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid parent id.");
    }
    const parent = await Parent.findById(id);
    if (!parent) throw new ApiError(404, "Parent not found.");

    const user = await User.findById(parent.user);
    if (!user) throw new ApiError(404, "This parent has no sign-in account.");

    const result = await sendAccessEmail(
      user,
      await adminDisplayName(session.userId),
    );
    return ok({ sent: true, ...result });
  });
}
