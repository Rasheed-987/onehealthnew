import mongoose from "mongoose";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { ApproveSchema } from "@/lib/guardianLinks";
import { isObjectId } from "@/lib/teachers";
import { GuardianLinkRequest, Student } from "@/models";
import { GUARDIAN_LINK_STATUS } from "@/models/enums";

/**
 * Staff granting a guardian access to a child.
 *
 * This is the only place a link request turns into real access, and everything
 * else in the feature is arranged so that it stays that way: registration files
 * a claim, this writes it. A guardian row on `Student.guardians[]` is what
 * `guardedStudentIds` reads, so the moment this commits the family can see the
 * child's medical notes, daily sheets, photos and message threads.
 *
 * `student.save()` rather than an `updateOne` with `$push`, for the reason the
 * students route gives: the pre('validate') hook that forbids the same parent
 * appearing twice on a child only runs on a document save. A `$push` would
 * happily write the duplicate that hook exists to prevent.
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

    const input = await parseBody(request, ApproveSchema);

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const linkRequest =
          await GuardianLinkRequest.findById(id).session(dbSession);
        if (!linkRequest) throw new ApiError(404, "Request not found.");

        /*
         * Re-read inside the transaction and re-check the status, rather than
         * trusting what the table showed. Two members of staff working the same
         * queue is the normal case, not the exotic one, and without this the
         * second click would write a second guardian row.
         */
        if (linkRequest.status !== GUARDIAN_LINK_STATUS.PENDING) {
          throw new ApiError(
            409,
            "That request has already been dealt with.",
          );
        }

        const student = await Student.findById(linkRequest.student).session(
          dbSession,
        );
        if (!student) {
          throw new ApiError(
            404,
            "That child's record no longer exists. Reject this request instead.",
          );
        }

        if (
          student.guardians.some(
            (g) => String(g.parent) === String(linkRequest.parent),
          )
        ) {
          throw new ApiError(
            409,
            "That guardian is already linked to this child.",
          );
        }

        const relationship = input.relationship ?? linkRequest.relationship;

        student.guardians.push({
          parent: linkRequest.parent,
          relationship,
        });
        await student.save({ session: dbSession });

        linkRequest.status = GUARDIAN_LINK_STATUS.APPROVED;
        linkRequest.relationship = relationship;
        linkRequest.decidedBy = new mongoose.Types.ObjectId(session.userId);
        linkRequest.decidedAt = new Date();
        await linkRequest.save({ session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }

    return ok({ message: "Guardian linked." });
  });
}
