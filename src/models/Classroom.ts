import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  CLASSROOM_TEACHER_ROLE,
  GRADE_LEVEL,
  type ClassroomTeacherRole,
  type GradeLevel,
} from "./enums";

/**
 * A teacher's posting to a classroom.
 *
 * The "Class Teacher" and "Additional Teachers" columns in the UI are both
 * rows in this one list, separated by `role`. Modelling them as one list with
 * a role - rather than a `classTeacher` field plus a separate array - makes it
 * structurally impossible for the same teacher to appear as both.
 */
export interface IClassroomTeacher {
  teacher: Types.ObjectId;
  role: ClassroomTeacherRole;
  assignedAt: Date;
}

export interface IClassroom {
  _id: Types.ObjectId;
  /** Display name, e.g. "Abu Dhabi", "Fujairah". */
  name: string;
  gradeLevel: GradeLevel;
  /** Free text: the UI shows values like "3" and "Room1". */
  roomNumber?: string;
  /**
   * How many children the room is meant to hold - the "Total Seats" column.
   *
   * Not enforced as a hard limit: a nursery routinely runs a room one or two
   * over while a transfer completes, and refusing the enrolment would push
   * staff into keeping that child off the register entirely, which is worse.
   * The UI flags the overflow instead.
   */
  capacity: number;
  
  teachers: IClassroomTeacher[];
  isActive: boolean;
  /** Super admin or teacher. */
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClassroomTeacherSchema = new Schema<IClassroomTeacher>(
  {
    teacher: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(CLASSROOM_TEACHER_ROLE),
      default: CLASSROOM_TEACHER_ROLE.ASSISTANT,
    },
    assignedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ClassroomSchema = new Schema<IClassroom>(
  {
    name: {
      type: String,
      required: [true, "Classroom name is required."],
      trim: true,
    },
    gradeLevel: {
      type: String,
      enum: Object.values(GRADE_LEVEL),
      required: true,
      index: true,
    },
    roomNumber: { type: String, trim: true },
    capacity: {
      type: Number,
      required: [true, "Total seats is required."],
      min: [1, "A classroom needs at least one seat."],
    },
    teachers: { type: [ClassroomTeacherSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// One classroom name per grade level.
ClassroomSchema.index({ name: 1, gradeLevel: 1 }, { unique: true });
// Teacher dashboard: "which classrooms am I on?".
ClassroomSchema.index({ "teachers.teacher": 1 });

/**
 * Array-internal invariants MongoDB indexes cannot express.
 */
ClassroomSchema.pre("validate", async function () {
  const teacherIds = this.teachers.map((t) => String(t.teacher));

  if (new Set(teacherIds).size !== teacherIds.length) {
    this.invalidate(
      "teachers",
      "A teacher cannot be assigned to the same classroom twice.",
    );
  }

  const leadCount = this.teachers.filter(
    (t) => t.role === CLASSROOM_TEACHER_ROLE.LEAD,
  ).length;
  if (leadCount > 1) {
    this.invalidate(
      "teachers",
      "A classroom can have only one lead class teacher.",
    );
  }
});

export const Classroom =
  (models.Classroom as Model<IClassroom>) ??
  model<IClassroom>("Classroom", ClassroomSchema);
