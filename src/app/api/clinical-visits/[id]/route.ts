import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  UpdateVisitSchema,
  hydrateClinicalVisitRows,
} from "@/lib/clinicalVisits";
import { resolveRecordScope } from "@/lib/recordScope";
import { isObjectId } from "@/lib/teachers";
import type { SessionPayload } from "@/lib/session";
import { ClinicalVisit } from "@/models";

/**
 * One clinical visit: reading it, correcting it, removing it.
 *
 * PATCH rather than PUT, and no upsert: a visit has no natural key, so the
 * collection route creates and this one edits an existing id. See the note on
 * POST in ../route.ts.
 */

/**
 * "" means clear the field, per the update convention in `students.ts`.
 *
 * Mongoose's `trim: true` does not turn an empty string into an absent value -
 * it stores the "" - so the row would come back as `""` where the caller asked
 * for nothing. Assigning `undefined` unsets the path on save, and the DTO then
 * serialises it as `null` like every other empty field.
 */
function cleared(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

async function findInScope(session: SessionPayload, id: string) {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid visit id.");
  }
  const scope = await resolveRecordScope(session);
  // The scope goes in the query, not into a check after the read: a visit the
  // caller may not see is then indistinguishable from one that is not there.
  const visit = await ClinicalVisit.findOne({ _id: id, ...scope.filter });
  if (!visit) throw new ApiError(404, "Clinical visit not found.");
  return visit;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/clinical-visits/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("health:list");
    const { id } = await context.params;
    const visit = await findInScope(session, id);
    const [row] = await hydrateClinicalVisitRows([visit]);
    return ok({ visit: row });
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/clinical-visits/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("health:write");
    const { id } = await context.params;
    /*
     * The read scope is the write gate here, and that is enough: a teacher's
     * filter is `{ classroom: { $in: rooms they are posted to } }`, so a visit
     * they can load is by definition one in their own room. `student` and
     * `classroom` are not editable, so there is no way to move the record out
     * of the scope that just authorised it.
     */
    const visit = await findInScope(session, id);
    const input = await parseBody(request, UpdateVisitSchema);

    // `undefined` leaves a field alone; "" clears it - see `cleared` above.
    if (input.visitedAt !== undefined) visit.visitedAt = new Date(input.visitedAt);
    if (input.fluSymptoms !== undefined) visit.fluSymptoms = input.fluSymptoms;
    if (input.fluSymptomsOther !== undefined) {
      visit.fluSymptomsOther = cleared(input.fluSymptomsOther);
    }
    if (input.otherSymptoms !== undefined) {
      visit.otherSymptoms = input.otherSymptoms;
    }
    if (input.additionalSymptoms !== undefined) {
      visit.additionalSymptoms = input.additionalSymptoms;
    }
    if (input.additionalSymptomsOther !== undefined) {
      visit.additionalSymptomsOther = cleared(input.additionalSymptomsOther);
    }
    if (input.nursingCare !== undefined) visit.nursingCare = input.nursingCare;
    if (input.careNotes !== undefined) visit.careNotes = cleared(input.careNotes);
    if (input.outcome !== undefined) visit.outcome = input.outcome;
    if (input.notes !== undefined) visit.notes = cleared(input.notes);

    // save(), not updateOne(), so the pre("validate") hook actually runs.
    await visit.save();

    const [row] = await hydrateClinicalVisitRows([visit]);
    return ok({ visit: row });
  });
}

/**
 * A hard delete, matching `progress:delete` on the daily sheet.
 *
 * The gallery soft-deletes because a post that families have already seen
 * should stay recoverable. A clinical visit is only ever removed because it
 * was entered against the wrong child or by mistake, and leaving a wrong
 * medical record in the collection - invisible but present - is worse than
 * removing it. Admin only.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/clinical-visits/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("health:delete");
    const { id } = await context.params;
    const visit = await findInScope(session, id);
    await visit.deleteOne();
    return ok({ success: true });
  });
}
