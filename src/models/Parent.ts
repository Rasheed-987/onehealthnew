import { Schema, model, models, type Model, type Types } from "mongoose";

/**
 * Guardian profile. Always backed by a User with role PARENT.
 *
 * The parent -> student link is NOT stored here. It lives in
 * `Student.guardians[]`, so a child carries its own contact list and a single
 * read of the student gives you everyone authorised for them. Fetch a parent's
 * children with `Student.find({ "guardians.parent": parentId })`.
 */
export interface IParent {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  occupation?: string;
  address?: string;
  /** Secondary number for when the primary phone on User is unreachable. */
  emergencyPhone?: string;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ParentSchema = new Schema<IParent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    occupation: { type: String, trim: true },
    address: { type: String, trim: true },
    emergencyPhone: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

export const Parent =
  (models.Parent as Model<IParent>) ?? model<IParent>("Parent", ParentSchema);
