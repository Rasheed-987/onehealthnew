import { z } from "zod";

import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABEL,
  TIME_OF_DAY_PATTERN,
  type AttendanceStatus,
} from "@/models/enums";
import { Classroom, Student, User, startOfDayUTC, toDayKey } from "@/models";
import type { IAttendance, IClassroom, IStudent, IUser } from "@/models";

/**
 * Shapes shared by the attendance routes and the screens that call them.
 *
 * The validation here deliberately restates the three rules already written as
 * a `pre("validate")` hook on the Attendance model. That is not an oversight:
 * marking the register is an upsert (`{ student, date }` is unique, so
 * re-marking has to be an update), and Mongoose document middleware does not
 * run on `findOneAndUpdate` or `bulkWrite`. If the rules lived only on the
 * model, every write from the mobile register would skip them.
 */

/** "2025-05-16" - the wire format for a school day. */
export const DayKeySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2025-05-16.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a real date.");

const timeOfDay = z
  .string()
  .trim()
  .regex(TIME_OF_DAY_PATTERN, "Use a 24-hour time such as 08:50.");

/** One child's line on the register, as the mobile app submits it. */
export const AttendanceEntrySchema = z
  .object({
    student: z.string().min(1, "Choose a child."),
    status: z.enum(ATTENDANCE_STATUS),
    checkInAt: timeOfDay.optional(),
    checkOutAt: timeOfDay.optional(),
    note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.checkOutAt && !entry.checkInAt) {
      ctx.addIssue({
        code: "custom",
        path: ["checkOutAt"],
        message: "A check-out time needs a check-in time to go with it.",
      });
    }
    // "HH:mm" is zero-padded, so a plain string compare orders correctly.
    if (
      entry.checkInAt &&
      entry.checkOutAt &&
      entry.checkOutAt < entry.checkInAt
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["checkOutAt"],
        message: "Check-out cannot be before check-in.",
      });
    }
    const isAway =
      entry.status === ATTENDANCE_STATUS.ABSENT ||
      entry.status === ATTENDANCE_STATUS.EXCUSED;
    if (isAway && (entry.checkInAt || entry.checkOutAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "A child marked absent or excused cannot have check-in times.",
      });
    }
  });
export type AttendanceEntryInput = z.infer<typeof AttendanceEntrySchema>;

/**
 * Taking the register: one room, one day, many children.
 *
 * Submitted whole rather than a request per child so a teacher on a patchy
 * nursery connection either gets the whole register in or gets a single error
 * to retry - not eleven children saved and nine lost.
 */
export const MarkRegisterSchema = z.object({
  classroom: z.string().min(1, "Choose a classroom."),
  date: DayKeySchema,
  entries: z
    .array(AttendanceEntrySchema)
    .min(1, "Mark at least one child.")
    .max(200, "That is more children than a room can hold.")
    .refine(
      (list) => new Set(list.map((e) => e.student)).size === list.length,
      "The same child appears twice on this register.",
    ),
});
export type MarkRegisterInput = z.infer<typeof MarkRegisterSchema>;

export interface AttendanceRow {
  id: string;
  /** "2025-05-16". */
  date: string;
  status: AttendanceStatus;
  statusLabel: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
  student: { id: string; fullName: string };
  /** The room as it was on the day, not the room the child is in now. */
  classroom: { id: string; name: string } | null;
  recordedBy: { id: string; name: string } | null;
}

export function toAttendanceRow(
  record: IAttendance,
  students: Map<string, IStudent>,
  classrooms: Map<string, IClassroom>,
  users: Map<string, IUser>,
): AttendanceRow {
  const student = students.get(String(record.student));
  const classroom = classrooms.get(String(record.classroom));
  const user = users.get(String(record.recordedBy));

  return {
    id: String(record._id),
    date: toDayKey(record.date),
    status: record.status,
    statusLabel: ATTENDANCE_STATUS_LABEL[record.status],
    checkInAt: record.checkInAt ?? null,
    checkOutAt: record.checkOutAt ?? null,
    note: record.note ?? null,
    student: {
      id: String(record.student),
      fullName: student
        ? `${student.firstName} ${student.lastName}`.trim()
        : "Unknown",
    },
    classroom: classroom
      ? { id: String(classroom._id), name: classroom.name }
      : null,
    recordedBy: user
      ? {
          id: String(record.recordedBy),
          name: `${user.firstName} ${user.lastName}`.trim(),
        }
      : null,
  };
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** PRESENT + LATE over total, as a whole percent. Null when nothing is marked. */
  attendanceRate: number | null;
}

/** Counts for the header tiles. Present-and-late counts as "in school". */
export function summarise(
  records: readonly { status: AttendanceStatus }[],
): AttendanceSummary {
  const count = (status: AttendanceStatus) =>
    records.filter((r) => r.status === status).length;

  const present = count(ATTENDANCE_STATUS.PRESENT);
  const late = count(ATTENDANCE_STATUS.LATE);
  const total = records.length;

  return {
    total,
    present,
    absent: count(ATTENDANCE_STATUS.ABSENT),
    late,
    excused: count(ATTENDANCE_STATUS.EXCUSED),
    attendanceRate:
      total === 0 ? null : Math.round(((present + late) / total) * 100),
  };
}

/**
 * A `date` filter from an optional range.
 *
 * Both ends run through `startOfDayUTC` for the same reason the model's setter
 * does - a stored date is always UTC midnight, so a filter built from a local
 * timestamp would sit a few hours off and drop the boundary day.
 */
export function dayRangeFilter(
  from?: string,
  to?: string,
): Record<string, Date> | undefined {
  const filter: Record<string, Date> = {};
  if (from) filter.$gte = startOfDayUTC(from);
  if (to) filter.$lte = startOfDayUTC(to);
  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Fills in the names a register line refers to by id.
 *
 * Three `$in` lookups rather than `populate`, because the same student and the
 * same classroom recur on nearly every row of a month's register - populate
 * would refetch them per row.
 */
export async function hydrateAttendanceRows(
  records: IAttendance[],
): Promise<AttendanceRow[]> {
  if (records.length === 0) return [];

  const ids = <T,>(values: T[]) => Array.from(new Set(values.map(String)));

  const [students, classrooms, users] = await Promise.all([
    Student.find({ _id: { $in: ids(records.map((r) => r.student)) } }),
    Classroom.find({ _id: { $in: ids(records.map((r) => r.classroom)) } }),
    User.find({ _id: { $in: ids(records.map((r) => r.recordedBy)) } }),
  ]);

  const byId = <T extends { _id: unknown }>(docs: T[]) =>
    new Map(docs.map((d) => [String(d._id), d]));

  return records.map((record) =>
    toAttendanceRow(
      record,
      byId(students) as Map<string, IStudent>,
      byId(classrooms) as Map<string, IClassroom>,
      byId(users) as Map<string, IUser>,
    ),
  );
}
