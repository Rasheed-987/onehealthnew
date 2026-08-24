import { z } from "zod";

import {
  CLASSROOM_TEACHER_ROLE,
  GRADE_LEVEL,
  GRADE_LEVEL_LABEL,
} from "@/models/enums";
import { Classroom, Enrollment, Teacher, User } from "@/models";
import { ENROLLMENT_STATUS } from "@/models/enums";
import type { IClassroom, ITeacher, IUser } from "@/models";

/**
 * Shapes shared by the classroom routes and the screens that call them.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const clearableText = z.string().trim().optional();

/**
 * The teacher roster as the form submits it.
 *
 * One list with a role rather than a `classTeacher` field plus an array - see
 * the note on the Classroom model. The lead/assistant split in the UI is a
 * rendering detail of this one list.
 */
export const ClassroomTeacherInputSchema = z.object({
  teacher: z.string().min(1, "Choose a teacher."),
  role: z
    .enum(CLASSROOM_TEACHER_ROLE)
    .default(CLASSROOM_TEACHER_ROLE.ASSISTANT),
});

const teachersField = z
  .array(ClassroomTeacherInputSchema)
  .default([])
  .refine(
    (list) => new Set(list.map((t) => t.teacher)).size === list.length,
    "The same teacher cannot be added twice.",
  )
  .refine(
    (list) =>
      list.filter((t) => t.role === CLASSROOM_TEACHER_ROLE.LEAD).length <= 1,
    "A classroom can have only one class teacher.",
  );

export const CreateClassroomSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  gradeLevel: z.enum(GRADE_LEVEL),
  roomNumber: optionalText,
  capacity: z.coerce
    .number()
    .int("Total seats must be a whole number.")
    .min(1, "A classroom needs at least one seat."),
  teachers: teachersField,
});

export const UpdateClassroomSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").optional(),
  gradeLevel: z.enum(GRADE_LEVEL).optional(),
  roomNumber: clearableText,
  capacity: z.coerce
    .number()
    .int("Total seats must be a whole number.")
    .min(1, "A classroom needs at least one seat.")
    .optional(),
  isActive: z.boolean().optional(),
  teachers: teachersField.optional(),
});

export interface ClassroomTeacherRow {
  teacherId: string;
  name: string;
  role: string;
}

export interface ClassroomRow {
  id: string;
  name: string;
  gradeLevel: string;
  gradeLabel: string;
  roomNumber: string | null;
  capacity: number;
  /** ACTIVE enrolments right now - the "Used Seats" column. */
  usedSeats: number;
  /** True when usedSeats exceeds capacity, which the UI colours differently. */
  isOverCapacity: boolean;
  isActive: boolean;
  /** The single LEAD, if one is assigned. */
  classTeacher: ClassroomTeacherRow | null;
  /** Everyone else on the roster. */
  additionalTeachers: ClassroomTeacherRow[];
}

type PopulatedTeacher = Omit<ITeacher, "user"> & { user: IUser | null };

/** "Ms. Amal Hassan" - how a teacher is named everywhere in the UI. */
export function teacherDisplayName(teacher: PopulatedTeacher): string {
  const user = teacher.user;
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  return `${teacher.title} ${name}`.trim();
}

export function toClassroomRow(
  classroom: IClassroom,
  teachers: PopulatedTeacher[] = [],
  usedSeats = 0,
): ClassroomRow {
  const byId = new Map(teachers.map((t) => [String(t._id), t]));

  const rows: ClassroomTeacherRow[] = classroom.teachers.map((link) => {
    const teacher = byId.get(String(link.teacher));
    return {
      teacherId: String(link.teacher),
      name: teacher ? teacherDisplayName(teacher) : "Unknown",
      role: link.role,
    };
  });

  return {
    id: String(classroom._id),
    name: classroom.name,
    gradeLevel: classroom.gradeLevel,
    gradeLabel: GRADE_LEVEL_LABEL[classroom.gradeLevel] ?? classroom.gradeLevel,
    roomNumber: classroom.roomNumber ?? null,
    capacity: classroom.capacity,
    usedSeats,
    isOverCapacity: usedSeats > classroom.capacity,
    isActive: classroom.isActive,
    classTeacher:
      rows.find((r) => r.role === CLASSROOM_TEACHER_ROLE.LEAD) ?? null,
    additionalTeachers: rows.filter(
      (r) => r.role !== CLASSROOM_TEACHER_ROLE.LEAD,
    ),
  };
}

/**
 * Fills in the teacher names and the seat counts for a page of classrooms.
 *
 * Lives here rather than in the route module so the single-classroom route can
 * reuse it without importing across route files. The query count is fixed
 * however many rooms are on the page.
 */
export async function decorateClassrooms(
  classrooms: InstanceType<typeof Classroom>[],
): Promise<ClassroomRow[]> {
  const teacherIds = classrooms.flatMap((room) =>
    room.teachers.map((t) => t.teacher),
  );

  const [teachers, seatCounts] = await Promise.all([
    Teacher.find({ _id: { $in: teacherIds } }).populate<{
      user: InstanceType<typeof User>;
    }>("user"),
    // One grouped count rather than a countDocuments per room.
    Enrollment.aggregate<{ _id: unknown; count: number }>([
      {
        $match: {
          classroom: { $in: classrooms.map((c) => c._id) },
          status: ENROLLMENT_STATUS.ACTIVE,
        },
      },
      { $group: { _id: "$classroom", count: { $sum: 1 } } },
    ]),
  ]);

  const used = new Map(seatCounts.map((s) => [String(s._id), s.count]));
  const populated = teachers.map((t) => t.toObject());

  return classrooms.map((room) =>
    toClassroomRow(room.toObject(), populated, used.get(String(room._id)) ?? 0),
  );
}
