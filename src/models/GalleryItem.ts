import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  GALLERY_ITEM_TYPE,
  MEDIA_KIND,
  type GalleryItemType,
  type MediaKind,
} from "./enums";

/**
 * A photo or clip a teacher posts for the children in it.
 *
 * Visibility is carried by `students`: an item is readable by the guardians of
 * the students tagged on it, and by nobody else. There is deliberately no
 * "share with the whole school" flag - every photo here is of a named child,
 * and making the audience a property of the tags means a guardian can never be
 * shown a picture of a child that is not theirs by a mis-set boolean.
 *
 * `classroom` is a filing label for the teacher's own view. It does NOT widen
 * the audience.
 */
export interface IGalleryItem {
  _id: Types.ObjectId;
  title?: string;
  description?: string;
  type: GalleryItemType;
  mediaKind: MediaKind;
  mediaUrl: string;
  /** Smaller still for the table and the feed grid. */
  thumbnailUrl?: string;
  /** The teacher credited on the post - the "Teacher" column. */
  teacher: Types.ObjectId;
  /** Who this is of. Also the read scope: at least one, no duplicates. */
  students: Types.ObjectId[];
  classroom?: Types.ObjectId | null;
  /** When the photo was taken, if that differs from when it was posted. */
  takenAt?: Date;
  /** Soft delete, so a removed post drops out of guardian feeds intact. */
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GalleryItemSchema = new Schema<IGalleryItem>(
  {
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: Object.values(GALLERY_ITEM_TYPE),
      default: GALLERY_ITEM_TYPE.UPDATE,
    },
    mediaKind: {
      type: String,
      enum: Object.values(MEDIA_KIND),
      default: MEDIA_KIND.IMAGE,
    },
    mediaUrl: {
      type: String,
      required: [true, "A gallery item needs an image or video."],
      trim: true,
    },
    thumbnailUrl: { type: String, trim: true },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    students: {
      type: [{ type: Schema.Types.ObjectId, ref: "Student" }],
      default: [],
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
    },
    takenAt: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// The guardian feed: "everything tagged with one of my children, newest first".
GalleryItemSchema.index({ students: 1, isActive: 1, createdAt: -1 });
// The teacher's own filing view.
GalleryItemSchema.index({ classroom: 1, createdAt: -1 });
// "What have I posted?" - the teacher's own credited items.
GalleryItemSchema.index({ teacher: 1, createdAt: -1 });
// The admin table. `type` and `isActive` are deliberately not indexed on their
// own: four values and a boolean are never selective enough to earn one.
GalleryItemSchema.index({ createdAt: -1 });

GalleryItemSchema.pre("validate", async function () {
  // An untagged item would be visible to nobody, which is never what the
  // teacher meant - it is a silently lost post, so reject it at write time.
  if (this.students.length === 0) {
    this.invalidate(
      "students",
      "Tag at least one student - the tags decide who can see this.",
    );
  }

  const studentIds = this.students.map(String);
  if (new Set(studentIds).size !== studentIds.length) {
    this.invalidate(
      "students",
      "The same student cannot be tagged on an item twice.",
    );
  }
});

export const GalleryItem =
  (models.GalleryItem as Model<IGalleryItem>) ??
  model<IGalleryItem>("GalleryItem", GalleryItemSchema);
