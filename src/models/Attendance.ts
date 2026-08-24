import { Schema, model, models, type Model, type Types } from "mongoose";
import { startOfDayUTC } from "./day";
import {
  ATTENDANCE_STATUS,
  TIME_OF_DAY_PATTERN,
  type AttendanceStatus,
} from "./enums";

/**
 * One register line: this child, this day, present or not.
 *
 * `classroom` is copied off the student's enrolment at the moment the register
 * is taken rather than resolved on read. A child who transfers rooms in March
 * must not retroactively appear on the new room's February register, and a
 * denormalised copy is the only way to keep the old rows honest.
 */
export interface IAttendance {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  classroom: Types.ObjectId;
  /** Normalised to UTC midnight so `{ student, date }` can be unique. */
  date: Date;
  status: AttendanceStatus;
  /** "HH:mm", when the guardian handed the child over. */
  checkInAt?: string;
  checkOutAt?: string;
  /** Free text - "collected early by grandmother". */
  note?: string;
  /** The teacher or admin who took the register. */
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const timeOfDay = {
  type: String,
  trim: true,
  match: [TIME_OF_DAY_PATTERN, "Use a 24-hour time such as 08:50."],
} as const;

const AttendanceSchema = new Schema<IAttendance>(
  {
    student: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    classroom: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    date: {
      type: Date,
      required: [true, "An attendance date is required."],
      set: startOfDayUTC,
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
    },
    checkInAt: timeOfDay,
    checkOutAt: timeOfDay,
    note: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// One line per child per day. Re-marking is an update, never a second row.
AttendanceSchema.index({ student: 1, date: 1 }, { unique: true });
// Taking and reviewing the register for a room on a given day. `status` rides
// along so "who was absent this week?" is answered from the index alone -
// on its own it is far too low-cardinality to be worth an index.
AttendanceSchema.index({ classroom: 1, date: -1, status: 1 });
// The admin table, newest first.
AttendanceSchema.index({ date: -1 });

AttendanceSchema.pre("validate", async function () {
  if (this.checkOutAt && !this.checkInAt) {
    this.invalidate(
      "checkOutAt",
      "A check-out time needs a check-in time to go with it.",
    );
  }
  if (this.checkInAt && this.checkOutAt && this.checkOutAt < this.checkInAt) {
    // "HH:mm" is zero-padded, so a plain string compare orders correctly.
    this.invalidate("checkOutAt", "Check-out cannot be before check-in.");
  }

  const isAway =
    this.status === ATTENDANCE_STATUS.ABSENT ||
    this.status === ATTENDANCE_STATUS.EXCUSED;
  if (isAway && (this.checkInAt || this.checkOutAt)) {
    this.invalidate(
      "status",
      "A child marked absent or excused cannot have check-in times.",
    );
  }
});

export const Attendance =
  (models.Attendance as Model<IAttendance>) ??
  model<IAttendance>("Attendance", AttendanceSchema);
