import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  ADDITIONAL_SYMPTOM,
  FLU_SYMPTOM,
  NURSING_CARE,
  OTHER_SYMPTOM,
  VISIT_OUTCOME,
  type AdditionalSymptom,
  type FluSymptom,
  type NursingCare,
  type OtherSymptom,
  type VisitOutcome,
} from "./enums";

/**
 * One trip to the nurse: what the child came in with, what was done, and how it
 * ended. The five sections below are the five headings on the form.
 *
 * The one structural difference from Attendance and DailyProgress, which this
 * otherwise resembles closely: there is NO unique key and no day normalisation.
 * A child can graze a knee at 09:00 and spike a fever at 14:00, and those are
 * two visits, not one record edited twice. So this collection is an append-only
 * log keyed on nothing, `visitedAt` keeps its clock time, and the routes are
 * POST-then-PATCH rather than the upsert a natural key would force.
 */

export interface IClinicalVisit {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  /**
   * The room the child sat in when they were seen.
   *
   * Denormalised, and DERIVED from the child's active enrolment on write - see
   * `findStudentToRecord`. It is what a teacher's read scope filters on, so if
   * a caller could name it, a teacher could pull another room's child into
   * their own. Also the reason `resolveRecordScope` works here unchanged.
   */
  classroom: Types.ObjectId;
  /**
   * A full timestamp, NOT normalised to midnight the way `DailyProgress.date`
   * is. The visit history shows "Aug 25 at 3:58 PM", and two visits on one day
   * have to be orderable.
   */
  visitedAt: Date;
  /** 01. Empty means nothing was ticked, which is a real answer. */
  fluSymptoms: FluSymptom[];
  /** The "Other flu symptoms" box under section 01. */
  fluSymptomsOther?: string;
  /** 02. */
  otherSymptoms: OtherSymptom[];
  /** 03. */
  additionalSymptoms: AdditionalSymptom[];
  /** The "Other additional symptoms" box under section 03. */
  additionalSymptomsOther?: string;
  /** 04. */
  nursingCare: NursingCare[];
  /** Section 04 reads "select or describe the care provided" - the describe half. */
  careNotes?: string;
  /** 05. Exclusive and required: a visit ends exactly one way. */
  outcome: VisitOutcome;
  /** Anything that does not fit a section. */
  notes?: string;
  /** The nurse, teacher, or admin who wrote the record up. */
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** The four checkbox groups, so the dedupe hook below can loop rather than repeat. */
const CHECKBOX_GROUPS = [
  ["fluSymptoms", "The same flu symptom cannot be recorded twice."],
  ["otherSymptoms", "The same symptom cannot be recorded twice."],
  ["additionalSymptoms", "The same symptom cannot be recorded twice."],
  ["nursingCare", "The same care cannot be recorded twice."],
] as const;

const ClinicalVisitSchema = new Schema<IClinicalVisit>(
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
    visitedAt: {
      type: Date,
      required: [true, "A visit time is required."],
      default: () => new Date(),
    },
    fluSymptoms: {
      type: [String],
      enum: Object.values(FLU_SYMPTOM),
      default: [],
    },
    fluSymptomsOther: { type: String, trim: true },
    otherSymptoms: {
      type: [String],
      enum: Object.values(OTHER_SYMPTOM),
      default: [],
    },
    additionalSymptoms: {
      type: [String],
      enum: Object.values(ADDITIONAL_SYMPTOM),
      default: [],
    },
    additionalSymptomsOther: { type: String, trim: true },
    nursingCare: {
      type: [String],
      enum: Object.values(NURSING_CARE),
      default: [],
    },
    careNotes: { type: String, trim: true },
    outcome: {
      type: String,
      enum: Object.values(VISIT_OUTCOME),
      required: [true, "Choose how the visit ended."],
    },
    notes: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// The child's visit history - the mockup's "Visit History", newest first.
ClinicalVisitSchema.index({ student: 1, visitedAt: -1 });
// "Show me what happened in my rooms." Serves a teacher's scoped read directly.
ClinicalVisitSchema.index({ classroom: 1, visitedAt: -1 });
// The admin table, newest first.
ClinicalVisitSchema.index({ visitedAt: -1 });

ClinicalVisitSchema.pre("validate", async function () {
  // Checkbox groups: the same box cannot be ticked twice.
  for (const [field, message] of CHECKBOX_GROUPS) {
    const list = this[field] ?? [];
    if (new Set(list).size !== list.length) this.invalidate(field, message);
  }

  // A visit cannot be recorded before it happens. `trim` on the schema does not
  // reach a Date, so this is the only guard on the clock.
  if (this.visitedAt && this.visitedAt.getTime() > Date.now()) {
    this.invalidate("visitedAt", "A visit cannot be recorded for the future.");
  }
});

export const ClinicalVisit =
  (models.ClinicalVisit as Model<IClinicalVisit>) ??
  model<IClinicalVisit>("ClinicalVisit", ClinicalVisitSchema);
