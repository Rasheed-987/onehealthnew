import mongoose from "mongoose";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { RejectSchema } from "@/lib/guardianLinks";
import { isObjectId } from "@/lib/teachers";
import { GuardianLinkRequest } from "@/models";
import { GUARDIAN_LINK_STATUS } from "@/models/enums";

/**
 * Staff refusing a link request.
 *
 * Writes nothing to the student - the whole point of the pending collection is
 * that a refused claim never touched the child's record in the first place.
 *
 * The row is closed rather than deleted. "Who asked for access to this child,
 * and who turned them down" is a safeguarding question the school may be asked
 * months later, and it is also what makes a second attempt from the same person
 * visible as a second attempt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requirePermission("guardianLink:decide");
    const { id } = await params;

    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid request id.");
    }

    const { note } = await parseBody(request, RejectSchema);

    const linkRequest = await GuardianLinkRequest.findById(id);
    if (!linkRequest) throw new ApiError(404, "Request not found.");

    // Same reason as on approve: two people work one queue.
    if (linkRequest.status !== GUARDIAN_LINK_STATUS.PENDING) {
      throw new ApiError(409, "That request has already been dealt with.");
    }

    linkRequest.status = GUARDIAN_LINK_STATUS.REJECTED;
    linkRequest.decidedBy = new mongoose.Types.ObjectId(session.userId);
    linkRequest.decidedAt = new Date();
    if (note) linkRequest.note = note;
    await linkRequest.save();

    return ok({ message: "Request rejected." });
  });
}
