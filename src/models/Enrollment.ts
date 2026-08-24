import { Schema, model, models, type Model, type Types } from "mongoose";
import { ENROLLMENT_STATUS, type EnrollmentStatus } from "./enums";

/**
 * A student's seat in a classroom, over time.
 *
 * This is a join collection rather than an array on either side because,
 * unlike guardians and teacher postings, the list is unbounded: it grows by a
 * row every term a child moves up. Keeping history means a transfer is a new
 * row plus a status change on the old one - nothing is overwritten, so an
 * attendance record from March still resolves to the room the child was in
 * back then.
 *
 * Exactly one enrolment per student may be ACTIVE; the partial unique index
 * below enforces that in the database rather than in a hook.
 */
export interface IEnrollment {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  classroom: Types.ObjectId;
  status: EnrollmentStatus;
  enrolledAt: Date;
  /** Set when the status leaves ACTIVE. Null while the child is in the room. */
  endedAt?: Date | null;
  /** Why the child left, for the transfer/withdrawal record. */
  note?: string;
  /** Super admin or teacher. */
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Statics live on the model because both questions are asked from every
 * attendance, progress and gallery screen, and both are easy to get subtly
 * wrong by forgetting the status filter.
 */
export interface IEnrollmentModel extends Model<IEnrollment> {
  /** The classroom a student is in right now, or null if unseated. */
  currentFor(studentId: Types.ObjectId | string): Promise<IEnrollment | null>;
  /** Every student currently seated in a classroom. */
  rosterFor(classroomId: Types.ObjectId | string): Promise<IEnrollment[]>;
}

const EnrollmentSchema = new Schema<IEnrollment, IEnrollmentModel>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      // No `index: true` here - the partial unique index below is declared on
      // the same key, and declaring both is what produced the "Duplicate
      // schema index on {student:1}" warning on every boot.
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ENROLLMENT_STATUS),
      default: ENROLLMENT_STATUS.ACTIVE,
    },
    enrolledAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    note: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// A child sits in one room at a time. Partial, so the closed historical rows
// are free to repeat the same student as often as they need to.
EnrollmentSchema.index(
  { student: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ENROLLMENT_STATUS.ACTIVE },
  },
);
// Class register: "who is in this room?". Covers plain classroom lookups too,
// so `classroom` needs no index of its own.
EnrollmentSchema.index({ classroom: 1, status: 1 });

/** A closed enrolment must say when it closed, and an open one must not. */
EnrollmentSchema.pre("validate", async function () {
  const isOpen = this.status === ENROLLMENT_STATUS.ACTIVE;

  if (isOpen && this.endedAt) {
    this.invalidate("endedAt", "An active enrolment cannot have an end date.");
  }
  if (!isOpen && !this.endedAt) {
    this.endedAt = new Date();
  }
  if (this.endedAt && this.endedAt < this.enrolledAt) {
    this.invalidate("endedAt", "An enrolment cannot end before it starts.");
  }
});

EnrollmentSchema.statics.currentFor = function (studentId) {
  return this.findOne({
    student: studentId,
    status: ENROLLMENT_STATUS.ACTIVE,
  }).exec();
};

EnrollmentSchema.statics.rosterFor = function (classroomId) {
  return this.find({
    classroom: classroomId,
    status: ENROLLMENT_STATUS.ACTIVE,
  }).exec();
};

export const Enrollment =
  (models.Enrollment as IEnrollmentModel) ??
  model<IEnrollment, IEnrollmentModel>("Enrollment", EnrollmentSchema);
