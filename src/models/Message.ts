import { Schema, model, models, type Model, type Types } from "mongoose";
import { MESSAGE_MAX_LENGTH, USER_ROLE, type UserRole } from "./enums";

/**
 * One message in a thread.
 *
 * `sender` is a **User**, not a Teacher or Parent profile, because a thread has
 * one teacher and any number of guardians on the other side - the only id that
 * identifies a speaker across both is the account they signed in with.
 * `senderRole` rides along denormalised so rendering a transcript does not have
 * to work out which side each line came from.
 *
 * There is no edit and no delete. A message to a family is a record of what the
 * school said, in the same way a clinical visit is a record of what the school
 * saw - quietly rewriting one after it has been read is not something the
 * product should be able to do.
 */

export interface IMessage {
  _id: Types.ObjectId;
  thread: Types.ObjectId;
  sender: Types.ObjectId;
  /** TEACHER or PARENT. The super admin reads threads but never writes one. */
  senderRole: UserRole;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    thread: {
      type: Schema.Types.ObjectId,
      ref: "MessageThread",
      required: true,
      // No `index: true` - the compound index below leads with this key.
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: {
      type: String,
      enum: Object.values(USER_ROLE),
      required: true,
    },
    body: {
      type: String,
      required: [true, "Write something first."],
      trim: true,
      maxlength: [
        MESSAGE_MAX_LENGTH,
        `A message cannot be longer than ${MESSAGE_MAX_LENGTH} characters.`,
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/*
 * Serves all four reads: the transcript, the `?after=` poll, the `?before=`
 * scroll-back, and the unread count - which is a range scan per thread from
 * that participant's `lastReadAt`.
 */
MessageSchema.index({ thread: 1, createdAt: 1 });

export const Message =
  (models.Message as Model<IMessage>) ?? model<IMessage>("Message", MessageSchema);
