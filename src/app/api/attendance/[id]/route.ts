import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { hydrateAttendanceRows } from "@/lib/attendance";
import { resolveRecordScope } from "@/lib/recordScope";
import { isObjectId } from "@/lib/teachers";
import { Attendance } from "@/models";

/**
 * A single register line.
 *
 * There is no PATCH here on purpose: correcting a mark is the same operation
 * as making it, so the app re-POSTs the child to `/api/attendance` and the
 * upsert lands on the same `{ student, date }` row.
 */

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/attendance/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("attendance:list");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid attendance id.");
    }

    const scope = await resolveRecordScope(session);
    // Scope goes into the query rather than a check after the read, so a line
    // outside it is indistinguishable from one that does not exist.
    const record = await Attendance.findOne({ _id: id, ...scope.filter });
    if (!record) throw new ApiError(404, "Attendance record not found.");

    const [row] = await hydrateAttendanceRows([record]);
    return ok({ record: row });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/attendance/[id]">,
) {
  return handle(async () => {
    // `attendance:delete` is super-admin-only - a teacher who marked the wrong
    // child corrects the line, they do not make the day disappear.
    await requirePermission("attendance:delete");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid attendance id.");
    }

    const record = await Attendance.findByIdAndDelete(id);
    if (!record) throw new ApiError(404, "Attendance record not found.");

    return ok({ success: true });
  });
}
