import { Schema, model, models, type Model, type Types } from "mongoose";
import { USER_ROLE, USER_STATUS, type UserRole, type UserStatus } from "./enums";

/**
 * The single authentication record for anyone who can sign in.
 *
 * Role-specific data does NOT live here - it lives in the Teacher / Parent /
 * Student profile that points back at this user. That keeps one login flow for
 * everyone and stops this collection growing a column per role.
 */
export interface IUser {
  _id: Types.ObjectId;
  email: string;
  /** bcrypt/argon hash. `select: false`, so it is never returned by accident. */
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  status: UserStatus;
  /**
   * Set when an administrator chose or generated this account's password.
   * The holder must replace it before they can use the app, so the admin does
   * not keep working credentials for someone else's account.
   */
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  /**
   * Rate-limiting state for emailed sign-in codes - see `claimCodeRequest`.
   *
   * Kept here rather than on VerificationToken because that collection holds at
   * most one live token per user per type: issuing a code deletes the previous
   * one, so it has no memory of how many have been asked for.
   */
  codeRequestCount?: number;
  codeRequestWindowAt?: Date | null;
  /** Who created this account. Null for the bootstrapped super admin. */
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Enter a valid email address."],
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLE),
      required: true,
      index: true,
    },


    
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    avatarUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.INVITED,
      index: true,
    },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    codeRequestCount: { type: Number, default: 0 },
    codeRequestWindowAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/**
 * At most one SUPER_ADMIN, enforced by the database rather than by whichever
 * code path happens to be creating users.
 *
 * The partial filter keeps only SUPER_ADMIN documents in the index, so the
 * uniqueness on `role` applies to them alone - every other role can repeat
 * freely. A second super admin fails the insert with E11000.
 */
UserSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: USER_ROLE.SUPER_ADMIN },
    name: "one_super_admin",
  },
);

UserSchema.virtual("fullName").get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`.trim();
});

export const User =
  (models.User as Model<IUser>) ?? model<IUser>("User", UserSchema);
