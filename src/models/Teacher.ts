import { Schema, model, models, type Model, type Types } from "mongoose";
import { TEACHER_TITLE, type TeacherTitle } from "./enums";

/**
 * Staff profile. Always backed by a User with role TEACHER.
 * Only a super admin may create one (see lib/permissions.ts).
 */
export interface ITeacher {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** School-issued staff number. Optional, but unique when present. */
  employeeId?: string;
  title: TeacherTitle;
  specialization?: string;
  joinedAt?: Date;
  isActive: boolean;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    employeeId: {
      type: String,
      trim: true,
      // `sparse` so the many teachers without a staff number do not all
      // collide on `null` under the unique index.
      unique: true,
      sparse: true,
    },
    title: {
      type: String,
      enum: Object.values(TEACHER_TITLE),
      default: TEACHER_TITLE.MS,
    },
    // Declared on ITeacher but missing from the schema, so it silently never
    // persisted - Mongoose drops paths it does not know about.
    specialization: { type: String, trim: true },
    joinedAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

export const Teacher =
  (models.Teacher as Model<ITeacher>) ??
  model<ITeacher>("Teacher", TeacherSchema);
