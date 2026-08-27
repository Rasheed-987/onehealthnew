import { Schema, model, models, type Model, type Types } from "mongoose";


/**
 * One conversation about one child, between that child's teacher and everyone
 * listed as the child's guardian.
 *
 * The thread is keyed on `{ student, teacher }` and nothing else. That pairing
 * is the whole access rule, which is why it is a unique index rather than a
 * convention: a teacher's threads are `{ teacher: theirId }` and a guardian's
 * are `{ student: { $in: theirChildren } }`, both a single index hit with no
 * membership array to fall out of sync with the roll.
 *
 * A consequence worth stating plainly, because families need to be told it:
 * both of a child's guardians share one thread. A mother and a father talking
 * to the same teacher about the same child are in the same conversation, not
 * two private ones. `readState` is per-user, so they still get their own unread
 * counts.
 *
 * `teacher` and not `classroom` is what scopes a teacher's inbox. A teacher who
 * moves rooms keeps their conversations; `classroom` is a filing label captured
 * at creation, exactly like `GalleryItem.classroom`, and it never widens or
 * narrows who can read the thread.
 */

/** Where one participant had got to, last time they opened the thread. */
export interface IThreadReadState {
  user: Types.ObjectId;
  lastReadAt: Date;
}

export interface IMessageThread {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  teacher: Types.ObjectId;
  /** The room the child was in when the conversation started. A label only. */
  classroom: Types.ObjectId;
  /**
   * Denormalised so the inbox can be drawn from this collection alone. A list
   * of thirty threads would otherwise be thirty look-ups for one line of text
   * each.
   */
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastMessageBy?: Types.ObjectId | null;
  readState: IThreadReadState[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ThreadReadStateSchema = new Schema<IThreadReadState>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastReadAt: { type: Date, required: true },
  },
  { _id: false },
);

const MessageThreadSchema = new Schema<IMessageThread>(
  {
    student: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: "", trim: true },
    lastMessageBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /*
     * Kept here rather than as a `readBy` array on every message. The
     * participants are a bounded set - one teacher and a handful of guardians -
     * whereas messages are unbounded, so per-message read receipts would grow a
     * document array with no ceiling for the same answer.
     */
    readState: { type: [ThreadReadStateSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/*
 * The thread key. Unique because "message this child's teacher" must be
 * idempotent - two guardians tapping it at the same moment have to land in the
 * same conversation, not create a second one nobody is watching.
 */
MessageThreadSchema.index({ student: 1, teacher: 1 }, { unique: true });
// The teacher's inbox.
MessageThreadSchema.index({ teacher: 1, lastMessageAt: -1 });
// The guardian's inbox - `student` is matched with an `$in` over their children.
MessageThreadSchema.index({ student: 1, lastMessageAt: -1 });
// The super admin's unfiltered view.
MessageThreadSchema.index({ lastMessageAt: -1 });

export const MessageThread =
  (models.MessageThread as Model<IMessageThread>) ??
  model<IMessageThread>("MessageThread", MessageThreadSchema);
