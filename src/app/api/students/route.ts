import { z } from "zod";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import { escapeRegex } from "@/lib/teachers";
import {
  CreateStudentSchema,
  toStudentRow,
  type StudentRow,
} from "@/lib/students";
import {
  assertGuardianListAllowed,
  studentScopeFilter,
} from "@/lib/studentScope";
import { Classroom, Enrollment, Parent, Student, User } from "@/models";
import { ENROLLMENT_STATUS } from "@/models/enums";

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Loads everything the rows need in a fixed number of queries, whatever the
 * page size: the guardians of everyone on the page, their current seats, and
 * the rooms those seats point at.
 */
async function decorate(students: (typeof Student.prototype)[]): Promise<StudentRow[]> {
  const parentIds = students.flatMap((s) =>
    s.guardians.map((g: { parent: unknown }) => g.parent),
  );
  const studentIds = students.map((s) => s._id);

  const [parents, enrollments] = await Promise.all([
    Parent.find({ _id: { $in: parentIds } }).populate<{
      user: InstanceType<typeof User>;
    }>("user"),
    Enrollment.find({
      student: { $in: studentIds },
      status: ENROLLMENT_STATUS.ACTIVE,
    }),
  ]);

  const classrooms = await Classroom.find({
    _id: { $in: enrollments.map((e) => e.classroom) },
  });

  return students.map((student) =>
    toStudentRow(
      student.toObject(),
      parents.map((p) => p.toObject()),
      enrollments,
      classrooms,
    ),
  );
}

export async function GET(request: Request) {
  return handle(async () => {
    const session = await requirePermission("student:list");

    const url = new URL(request.url);
    const { search, status, page, perPage } = ListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    // A guardian's list is narrowed to their own children before anything
    // else is applied.
    const filter: Record<string, unknown> = await studentScopeFilter(session);
    if (status) filter.isActive = status === "active";
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ firstName: pattern }, { lastName: pattern }];
    }

    const [students, total] = await Promise.all([
      Student.find(filter)
        .sort({ lastName: 1, firstName: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Student.countDocuments(filter),
    ]);

    return ok({
      students: await decorate(students),
      pagination: {
        page,
        perPage,
        total,
        pageCount: Math.max(1, Math.ceil(total / perPage)),
      },
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requirePermission("student:create");
    const input = await parseBody(request, CreateStudentSchema);

    // A guardian may add their own child, but not a child listing only other
    // people - that would be a way to attach yourself to the school roll.
    await assertGuardianListAllowed(session, input.guardians);

    const student = await Student.create({
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: new Date(input.dateOfBirth),
      gender: input.gender,
      nationality: input.nationality,
      medicalNotes: input.medicalNotes,
      guardians: input.guardians,
      createdBy: session.userId,
    });

    const [row] = await decorate([student]);
    return ok({ student: row }, 201);
  });
}
