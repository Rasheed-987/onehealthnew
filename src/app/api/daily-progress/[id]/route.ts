import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import { hydrateProgressRows } from "@/lib/dailyProgress";
import { resolveRecordScope } from "@/lib/recordScope";
import { isObjectId } from "@/lib/teachers";
import { DailyProgress } from "@/models";

/**
 * A single daily sheet.
 *
 * There is no PATCH here on purpose: correcting a sheet is the same operation
 * as writing it, so the app re-POSTs the child to `/api/daily-progress` and the
 * upsert lands on the same `{ student, date }` row. The client also does not
 * know the sheet's id before the first save of the day, which is why the write
 * lives on the collection rather than here.
 */

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/daily-progress/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("progress:list");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid daily progress id.");
    }

    const scope = await resolveRecordScope(session);
    // Scope goes into the query rather than a check after the read, so a sheet
    // outside it is indistinguishable from one that does not exist.
    const record = await DailyProgress.findOne({ _id: id, ...scope.filter });
    if (!record) throw new ApiError(404, "Daily progress record not found.");

    const [row] = await hydrateProgressRows([record]);
    return ok({ record: row });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/daily-progress/[id]">,
) {
  return handle(async () => {
    // `progress:delete` is super-admin-only - a teacher who filled in the
    // wrong child corrects the sheet, they do not make the day disappear.
    await requirePermission("progress:delete");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid daily progress id.");
    }

    const record = await DailyProgress.findByIdAndDelete(id);
    if (!record) throw new ApiError(404, "Daily progress record not found.");

    return ok({ success: true });
  });
}
