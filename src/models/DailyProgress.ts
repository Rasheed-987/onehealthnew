import { Schema, model, models, type Model, type Types } from "mongoose";
import { startOfDayUTC } from "./day";
import {
  MOOD,
  SUPPLY_NEED,
  TIME_OF_DAY_PATTERN,
  TOILET_TYPE,
  type Mood,
  type SupplyNeed,
  type ToiletType,
} from "./enums";

/**
 * The daily sheet a teacher fills in for each child and a guardian reads that
 * evening. The six sections below are the six headings on the paper form:
 * Drinking, Mood, Toilet, Fun, Sleep, Needs.
 *
 * Every section is optional and defaults to empty. A half-filled sheet is the
 * normal state of the form at 10am, so "not recorded yet" has to be
 * representable - it is an empty array, distinct from a recorded zero.
 */

const timeOfDay = {
  type: String,
  trim: true,
  match: [TIME_OF_DAY_PATTERN, "Use a 24-hour time such as 08:50."],
} as const;

/** One drink, e.g. 09:00 milk. */
export interface IDrinkEntry {
  at?: string;
  /** "milk", "water", "juice" - free text, the form has no fixed list. */
  what?: string;
}

/** One nappy change or toilet visit, e.g. 08:50 wet. */
export interface IToiletEntry {
  at?: string;
  type: ToiletType;
}

/** One nap. */
export interface INapEntry {
  from?: string;
  to?: string;
}

export interface IDailyProgress {
  _id: Types.ObjectId;
  student: Types.ObjectId;
  classroom: Types.ObjectId;
  /** Normalised to UTC midnight so `{ student, date }` can be unique. */
  date: Date;
  drinks: IDrinkEntry[];
  /** Checkbox group, not a single value - see MOOD. */
  moods: Mood[];
  toilet: IToiletEntry[];
  /** One bullet per line, as rendered in the guardian's feed. */
  fun: string[];
  naps: INapEntry[];
  /** What to send in tomorrow. */
  needs: SupplyNeed[];
  /** Anything that does not fit a section. */
  notes?: string;
  /** The teacher or admin who filled the sheet in. */
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DrinkEntrySchema = new Schema<IDrinkEntry>(
  {
    at: timeOfDay,
    what: { type: String, trim: true },
  },
  { _id: false },
);

const ToiletEntrySchema = new Schema<IToiletEntry>(
  {
    at: timeOfDay,
    type: {
      type: String,
      enum: Object.values(TOILET_TYPE),
      required: true,
    },
  },
  { _id: false },
);

const NapEntrySchema = new Schema<INapEntry>(
  {
    from: timeOfDay,
    to: timeOfDay,
  },
  { _id: false },
);

const DailyProgressSchema = new Schema<IDailyProgress>(
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
      required: [true, "A date is required."],
      set: startOfDayUTC,
    },
    drinks: { type: [DrinkEntrySchema], default: [] },
    moods: {
      type: [String],
      enum: Object.values(MOOD),
      default: [],
    },
    toilet: { type: [ToiletEntrySchema], default: [] },
    fun: { type: [String], default: [] },
    naps: { type: [NapEntrySchema], default: [] },
    needs: {
      type: [String],
      enum: Object.values(SUPPLY_NEED),
      default: [],
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

// One sheet per child per day. The teacher edits it through the day.
DailyProgressSchema.index({ student: 1, date: 1 }, { unique: true });
// "Show me today's sheets for my room."
DailyProgressSchema.index({ classroom: 1, date: -1 });
// The admin table, newest first.
DailyProgressSchema.index({ date: -1 });

DailyProgressSchema.pre("validate", async function () {
  // Checkbox groups: the same box cannot be ticked twice.
  if (new Set(this.moods).size !== this.moods.length) {
    this.invalidate("moods", "The same mood cannot be recorded twice.");
  }
  if (new Set(this.needs).size !== this.needs.length) {
    this.invalidate("needs", "The same supply cannot be requested twice.");
  }

  for (const nap of this.naps) {
    if (nap.to && !nap.from) {
      this.invalidate("naps", "A nap that has an end time needs a start time.");
      break;
    }
    // "HH:mm" is zero-padded, so a plain string compare orders correctly. A nap
    // running past midnight is not a thing at a nursery.
    if (nap.from && nap.to && nap.to < nap.from) {
      this.invalidate("naps", "A nap cannot end before it starts.");
      break;
    }
  }

  // Blank bullets come from an empty row left in the form; drop them rather
  // than rejecting the whole sheet.
  this.fun = this.fun.map((line) => line.trim()).filter(Boolean);
});

export const DailyProgress =
  (models.DailyProgress as Model<IDailyProgress>) ??
  model<IDailyProgress>("DailyProgress", DailyProgressSchema);
