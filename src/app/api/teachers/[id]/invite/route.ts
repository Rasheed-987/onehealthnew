import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { adminDisplayName, sendAccessEmail } from "@/lib/accountAccess";
import { isObjectId } from "@/lib/teachers";
import { Teacher, User } from "@/models";

/**
 * Re-sends whichever access email this teacher needs - an invitation if they
 * have never set a password, a reset if they have lost one. The decision and
 * the sending both live in `accountAccess`, shared with the parents route.
 */
export async function POST(
  _request: NextRequest,
  context: RouteContext<"/api/teachers/[id]/invite">,
) {
  return handle(async () => {
    const session = await requirePermission("teacher:update");
    const { id } = await context.params;

    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid teacher id.");
    }
    const teacher = await Teacher.findById(id);
    if (!teacher) throw new ApiError(404, "Teacher not found.");

    const user = await User.findById(teacher.user);
    if (!user) throw new ApiError(404, "This teacher has no sign-in account.");

    const result = await sendAccessEmail(
      user,
      await adminDisplayName(session.userId),
    );
    return ok({ sent: true, ...result });
  });
}
