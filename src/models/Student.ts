import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  GENDER,
  GUARDIAN_RELATIONSHIP,
  type Gender,
  type GuardianRelationship,
} from "./enums";

/**
 * One guardian's link to this student, embedded on the student document.
 *
 * Embedded rather than a join collection because the list is small and bounded
 * (two parents, maybe a nanny) and is needed on every read of the student.
 * `Student.find({ "guardians.parent": id })` uses a multikey index, so the
 * parent-side lookup stays fast.
 */
export interface IStudentGuardian {
  parent: Types.ObjectId;
  /**
   * How this guardian relates to the child. The enum was imported and typed
   * from the start but never reached the schema, so the value silently never
   * persisted - see GUARDIAN_RELATIONSHIP in enums.ts, which exists to drive
   * the wording on contact cards and pickup lists.
   */
  relationship: GuardianRelationship;
}

export interface IStudent {
  _id: Types.ObjectId;
  /**
   * Optional login. Nursery and pre-school children do not sign in - their
   * guardians act for them - so this stays null until the school decides a
   * student is old enough to have an account.
   */
  user?: Types.ObjectId | null;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender;
  photoUrl?: string;
  guardians: IStudentGuardian[];
  medicalNotes?: string;
  isActive: boolean;
  nationality?: string;
  /** Derived from dateOfBirth on read - see the virtual below. Never stored. */
  age: number;
  /** Super admin, teacher, or the parent who added their own child. */
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentGuardianSchema = new Schema<IStudentGuardian>(
  {
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
    },
    relationship: {
      type: String,
      enum: Object.values(GUARDIAN_RELATIONSHIP),
      default: GUARDIAN_RELATIONSHIP.GUARDIAN,
    },
  },
  { _id: false },
);

const StudentSchema = new Schema<IStudent>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      // Uniqueness is enforced by the partial index below, NOT here - see the
      // note on that index for why `sparse` was wrong.
    },

    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required."],
    },
    nationality: { type: String, trim: true },
    gender: { type: String, enum: Object.values(GENDER), required: true },
    photoUrl: { type: String, trim: true },
    guardians: { type: [StudentGuardianSchema], default: [] },
    medicalNotes: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Parent dashboard: "show me my children".
StudentSchema.index({ "guardians.parent": 1 });
// Admin table search by name.
StudentSchema.index({ lastName: 1, firstName: 1 });

StudentSchema.virtual("fullName").get(function (this: IStudent) {
  return `${this.firstName} ${this.lastName}`.trim();
});

/**
 * Age in whole years, computed on read.
 *
 * It used to be a stored `age: Number` next to `dateOfBirth`, which is a fact
 * with an expiry date - every child's record silently became wrong on their
 * birthday, and nothing in the app was going to rewrite it. Nursery placement
 * is decided by age band, so a stale value here is not cosmetic.
 */
StudentSchema.virtual("age").get(function (this: IStudent) {
  const dob = this.dateOfBirth;
  if (!dob) return 0;
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  // Not had this year's birthday yet.
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    years -= 1;
  }
  return Math.max(0, years);
});

/**
 * The two guardian invariants, neither of which an index can express: MongoDB
 * cannot enforce uniqueness *within* an array, and it cannot require an array
 * to be non-empty. Mongoose 9 pre-hooks are async and take no `next` callback.
 */
StudentSchema.pre("validate", async function () {
  const guardianIds = this.guardians.map((g) => String(g.parent));

  if (new Set(guardianIds).size !== guardianIds.length) {
    this.invalidate(
      "guardians",
      "The same parent cannot be linked to a student twice.",
    );
  }

  /*
   * A child with no guardian is unreachable: nobody can be told about them,
   * and nobody can read their sheets. Only enforced when the list is actually
   * being written, so a legacy row that predates this rule stays repairable -
   * rejecting every save of it would leave the only fix as a manual DB edit.
   */
  if (
    (this.isNew || this.isModified("guardians")) &&
    this.guardians.length === 0
  ) {
    this.invalidate("guardians", "A student needs at least one guardian.");
  }
});

/**
 * At most one student per linked User account - but only among students that
 * actually have one.
 *
 * This was `unique: true, sparse: true` on the field, which is subtly wrong:
 * a sparse index skips documents where the key is ABSENT, while `default:
 * null` writes an explicit null that the index still stores. Every student
 * without a login therefore collided on `{ user: null }`, so the collection
 * accepted exactly one of them - and per the note on `user`, nursery children
 * are all supposed to be login-less. A partial index keyed on the field
 * actually being an ObjectId is the correct form.
 */
StudentSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: { user: { $type: "objectId" } },
    name: "user_when_present",
  },
);

export const Student =
  (models.Student as Model<IStudent>) ??
  model<IStudent>("Student", StudentSchema);
