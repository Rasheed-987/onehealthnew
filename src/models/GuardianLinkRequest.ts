import { Schema, model, models, type Model, type Types } from "mongoose";

import {
  GUARDIAN_LINK_STATUS,
  GUARDIAN_RELATIONSHIP,
  type GuardianLinkStatus,
  type GuardianRelationship,
} from "./enums";

/**
 * A guardian asking the school to link them to a child.
 *
 * This exists so that a parent registering in the app can name their child
 * without that claim granting anything. The link the app is asking for lives on
 * `Student.guardians[]`, and the moment a row appears there the parent can read
 * that child's medical notes, photos, daily sheets and messages - see the
 * `!seated` branch in `guardedStudentIds`, which deliberately makes even an
 * unenrolled child visible to its guardian. So an unapproved claim cannot be
 * parked there in a pending state; it needs a collection of its own, and only
 * a staff approval ever writes the real link.
 *
 * A join collection with a status enum rather than a row that gets deleted,
 * modelled on Enrollment: the history of who asked for access to a child, and
 * which member of staff let them in, is exactly what a safeguarding question
 * asks for later.
 */
export interface IGuardianLinkRequest {
  _id: Types.ObjectId;
  /** The guardian's profile. Their name and email hang off `Parent.user`. */
  parent: Types.ObjectId;
  /** Resolved from `studentIdTyped` when the request was filed. */
  student: Types.ObjectId;
  /**
   * What the parent actually typed, kept verbatim.
   *
   * Not redundant with `student`: if the school later re-issues or corrects an
   * admission number, this is the only record of what was on the piece of paper
   * the family was given, which is the first thing a support call needs.
   */
  studentIdTyped: string;
  /** Staff can correct this when approving; the app never asks for it. */
  relationship: GuardianRelationship;
  status: GuardianLinkStatus;
  /** The member of staff who approved or rejected. Null while PENDING. */
  decidedBy?: Types.ObjectId | null;
  decidedAt?: Date | null;
  /** Optional reason, shown to nobody but staff. */
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GuardianLinkRequestSchema = new Schema<IGuardianLinkRequest>(
  {
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
      // No `index: true` - the compound partial index below already leads with
      // this key, and declaring both warns about a duplicate schema index.
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentIdTyped: { type: String, required: true, trim: true },
    relationship: {
      type: String,
      enum: Object.values(GUARDIAN_RELATIONSHIP),
      default: GUARDIAN_RELATIONSHIP.GUARDIAN,
    },
    status: {
      type: String,
      enum: Object.values(GUARDIAN_LINK_STATUS),
      default: GUARDIAN_LINK_STATUS.PENDING,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    note: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/**
 * One live request per parent-child pair.
 *
 * Partial, exactly like Enrollment's ACTIVE index, so the closed rows are free
 * to repeat the pair as often as they need to - a parent whose request was
 * rejected in error can be told to submit again. Without it, a double tap on a
 * slow connection files the same claim twice and staff see it twice.
 */
GuardianLinkRequestSchema.index(
  { parent: 1, student: 1 },
  {
    unique: true,
    partialFilterExpression: { status: GUARDIAN_LINK_STATUS.PENDING },
    name: "one_pending_request_per_pair",
  },
);

// The review queue: pending first, oldest first, which is the only order a
// queue of people waiting should ever be worked in.
GuardianLinkRequestSchema.index({ status: 1, createdAt: 1 });

/** A decided request must say who decided it, and a pending one must not. */
GuardianLinkRequestSchema.pre("validate", async function () {
  const isPending = this.status === GUARDIAN_LINK_STATUS.PENDING;

  if (isPending && (this.decidedBy || this.decidedAt)) {
    this.invalidate(
      "decidedBy",
      "A request awaiting review cannot already have a decision.",
    );
  }
  if (!isPending && !this.decidedBy) {
    this.invalidate("decidedBy", "A decided request must record who decided it.");
  }
  if (!isPending && !this.decidedAt) {
    this.decidedAt = new Date();
  }
});

export const GuardianLinkRequest =
  (models.GuardianLinkRequest as Model<IGuardianLinkRequest>) ??
  model<IGuardianLinkRequest>(
    "GuardianLinkRequest",
    GuardianLinkRequestSchema,
  );
