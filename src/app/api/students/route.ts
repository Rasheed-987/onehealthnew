import mongoose from "mongoose";
import { z } from "zod";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { adminDisplayName, sendInviteAfterCreate } from "@/lib/accountAccess";
import {
  resolveGuardians,
  type CreatedGuardianAccount,
} from "@/lib/guardians";
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
import { ENROLLMENT_STATUS, USER_ROLE, USER_STATUS } from "@/models/enums";

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
      // Admission number included because it is what a guardian quotes on the
      // telephone, and what a link request shows staff before they approve it.
      filter.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { studentId: pattern },
      ];
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

/**
 * The enrolment sheet: one child and their guardians, in one submit.
 *
 * A guardian row is either someone picked from the search or someone typed in
 * by hand, and the second kind has no account yet. Both the child and any
 * accounts it needs are written in ONE transaction, so a sheet that fails
 * halfway leaves nothing behind - previously the guardian had to be created on
 * a separate screen first, which meant a half-enrolled family whenever anyone
 * was interrupted between the two.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requirePermission("student:create");
    const input = await parseBody(request, CreateStudentSchema);

    // Staff-only by permission, so this cannot currently fire; it is the
    // second layer that keeps a guardian from attaching a stranger to a child.
    await assertGuardianListAllowed(session, input.guardians);

    const dbSession = await mongoose.startSession();
    let studentId: mongoose.Types.ObjectId | null = null;
    let created: CreatedGuardianAccount[] = [];
    try {
      await dbSession.withTransaction(async () => {
        const resolved = await resolveGuardians(
          input.guardians,
          session.userId,
          dbSession,
        );

        const [student] = await Student.create(
          [
            {
              firstName: input.firstName,
              lastName: input.lastName,
              studentId: input.studentId,
              dateOfBirth: new Date(input.dateOfBirth),
              gender: input.gender,
              nationality: input.nationality,
              medicalNotes: input.medicalNotes,
              guardians: resolved.links,
              createdBy: session.userId,
            },
          ],
          { session: dbSession },
        );

        studentId = student._id;
        created = resolved.created;
      });
    } finally {
      await dbSession.endSession();
    }

    const student = await Student.findById(studentId);
    if (!student) throw new ApiError(500, "Student could not be created.");

    /*
     * Invites go out only after the transaction commits, for the same reason
     * they do on the parents route: an email cannot be rolled back, and a
     * guardian must never be told about a child a later failure undid.
     *
     * `sendInviteAfterCreate` never throws - the accounts exist and are
     * committed, so a mail failure is reported back for the admin to resend
     * rather than turned into an error that makes a successful enrolment look
     * like a failed one.
     */
    const invitedBy = created.length > 0
      ? await adminDisplayName(session.userId)
      : "";
    const invitations = await Promise.all(
      created.map(async (account) => ({
        parentId: account.parentId,
        email: account.email,
        ...(await sendInviteAfterCreate(
          {
            _id: account.userId,
            email: account.email,
            firstName: account.firstName,
            status: USER_STATUS.INVITED,
            role: USER_ROLE.PARENT,
          },
          invitedBy,
        )),
      })),
    );

    const [row] = await decorate([student]);
    return ok({ student: row, invitations }, 201);
  });
}
