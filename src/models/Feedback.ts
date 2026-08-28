import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  FEEDBACK_EXPERIENCE,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MAX_STARS,
  FEEDBACK_MIN_STARS,
  type FeedbackExperience,
} from "./enums";

/**
 * One piece of feedback a guardian left about the app or the nursery.
 *
 * `submittedBy` is a **User**, not a Parent profile - the same choice as
 * `Message.sender`, and for a plainer reason here: nothing about a comment on
 * the app is about a particular child, so routing it through the guardian's
 * profile would buy a join and answer no question. The user id is also all the
 * read scope needs: a guardian sees `{ submittedBy: me }`, the super admin
 * sees everything, and there is no third case.
 *
 * There is no `student` and no `classroom`, deliberately. Feedback is not a
 * record about a child, so it is outside `resolveRecordScope` entirely and no
 * teacher can read it - see the permission table.
 *
 * Nothing is editable. A parent who has changed their mind leaves a second
 * piece of feedback; letting them rewrite the first would mean the admin table
 * shows an opinion that was never actually held at the time it was dated. The
 * one write after creation is the super admin removing a row, and that is a
 * real delete rather than a flag - unlike a gallery post, a deleted comment
 * leaves no hole in anybody's feed to keep intact.
 */
export interface IFeedback {
  _id: Types.ObjectId;
  /** The account that left it. A guardian, enforced by `feedback:create`. */
  submittedBy: Types.ObjectId;
  /** The word. What the admin table groups by. */
  experience: FeedbackExperience;
  /** The number. The only half of the rating you can average. */
  stars: number;
  /** What they actually wrote. */
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // No `index: true` - the compound index below leads with this key.
    },
    experience: {
      type: String,
      enum: Object.values(FEEDBACK_EXPERIENCE),
      required: [true, "Choose how your experience has been."],
    },
    stars: {
      type: Number,
      required: [true, "Give it a star rating."],
      min: [FEEDBACK_MIN_STARS, `Ratings run from ${FEEDBACK_MIN_STARS} to ${FEEDBACK_MAX_STARS} stars.`],
      max: [FEEDBACK_MAX_STARS, `Ratings run from ${FEEDBACK_MIN_STARS} to ${FEEDBACK_MAX_STARS} stars.`],
      // Rejects 4.5, which the schema would otherwise store happily and the
      // table would render as "4.5 Stars".
      validate: {
        validator: Number.isInteger,
        message: "Pick a whole number of stars.",
      },
    },
    comment: {
      type: String,
      required: [true, "Tell us a little about your experience."],
      trim: true,
      maxlength: [
        FEEDBACK_MAX_LENGTH,
        `Feedback cannot be longer than ${FEEDBACK_MAX_LENGTH} characters.`,
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// The admin table: everything, newest first. Also serves the default sort of
// every filtered view, because the filters here (`experience`, `stars`) are a
// four-value enum and a five-value integer - never selective enough to lead an
// index of their own.
FeedbackSchema.index({ createdAt: -1 });
// "What have I already sent?" - a guardian's own submissions.
FeedbackSchema.index({ submittedBy: 1, createdAt: -1 });

export const Feedback =
  (models.Feedback as Model<IFeedback>) ??
  model<IFeedback>("Feedback", FeedbackSchema);
