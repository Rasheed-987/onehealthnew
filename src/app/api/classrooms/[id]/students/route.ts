import { z } from "zod";
import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { findClassroomInScope } from "@/lib/classroomScope";
import { ageFrom } from "@/lib/students";
import { escapeRegex, isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Parent, Student, User } from "@/models";
import { ENROLLMENT_STATUS } from "@/models/enums";

/**
 * The roster: who is sitting in this room right now, and moving children in
 * and out of it.
 *
 * An enrolment is never edited in place. Seating a child writes a new ACTIVE
 * row; removing one closes the existing row with a status and an end date.
 * That is what lets an attendance record from March still resolve to the room
 * the child was in back then - see the note on the Enrollment model.
 */

async function findClassroomOr404(id: string) {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid classroom id.");
  }
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new ApiError(404, "Classroom not found.");
  return classroom;
}

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/classrooms/[id]/students">,
) {
  return handle(async () => {
    const session = await requirePermission("classroom:list");
    const { id } = await context.params;
    /*
     * Scoped, unlike the writes below: this response carries every child's
     * name, age and guardian list, which is the most sensitive page in the
     * app. `classroom:list` alone admits teachers AND guardians, so without a
     * row-level check any signed-in parent could read any room's roster by id.
     */
    const classroom = await findClassroomInScope(session, id);

    const url = new URL(request.url);
    const { search, page, perPage } = ListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const enrollments = await Enrollment.find({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    }).sort({ enrolledAt: 1 });

    const activeStudentIds = enrollments.map((e) => e.student);

    const studentFilter: Record<string, unknown> = {
      _id: { $in: activeStudentIds },
    };

    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      studentFilter.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { studentId: pattern },
      ];
    }

    const total = await Student.countDocuments(studentFilter);

    let studentQuery = Student.find(studentFilter).sort({ lastName: 1, firstName: 1 });

    const hasPagination = page !== undefined || perPage !== undefined;
    const currentPage = page ?? 1;
    const currentPerPage = perPage ?? 20;

    if (hasPagination) {
      studentQuery = studentQuery
        .skip((currentPage - 1) * currentPerPage)
        .limit(currentPerPage);
    }

    const students = await studentQuery;

    const parentIds = Array.from(
      new Set(
        students.flatMap((s) =>
          s.guardians ? s.guardians.map((g) => String(g.parent)) : [],
        ),
      ),
    );

    const parents = await Parent.find({
      _id: { $in: parentIds },
    }).populate<{ user: InstanceType<typeof User> }>("user");

    const parentNameMap = new Map(
      parents.map((p) => [
        String(p._id),
        p.user ? `${p.user.firstName} ${p.user.lastName}`.trim() : "Unknown",
      ]),
    );

    const enrolledAt = new Map(
      enrollments.map((e) => [String(e.student), e.enrolledAt]),
    );

    const payload: Record<string, unknown> = {
      classroom: {
        id: String(classroom._id),
        name: classroom.name,
        capacity: classroom.capacity,
        usedSeats: enrollments.length,
      },
      students: students.map((student) => ({
        id: String(student._id),
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        age: ageFrom(student.dateOfBirth),
        gender: student.gender,
        isActive: student.isActive,
        enrolledAt:
          enrolledAt.get(String(student._id))?.toISOString() ?? null,
        guardians: (student.guardians ?? []).map((g) => ({
          parentId: String(g.parent),
          name: parentNameMap.get(String(g.parent)) ?? "Unknown",
          relationship: g.relationship,
        })),
      })),
    };

    if (hasPagination) {
      payload.pagination = {
        page: currentPage,
        perPage: currentPerPage,
        total,
        pageCount: Math.max(1, Math.ceil(total / currentPerPage)),
      };
    }

    return ok(payload);
  });
}


const EnrolSchema = z.object({
  student: z.string().min(1, "Choose a child."),
});

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/classrooms/[id]/students">,
) {
  return handle(async () => {
    const session = await requirePermission("enrollment:assign");
    const { id } = await context.params;
    const classroom = await findClassroomOr404(id);
    const { student: studentId } = await parseBody(request, EnrolSchema);

    if (!isObjectId(studentId)) {
      throw new ApiError(400, "That is not a valid student id.");
    }
    const student = await Student.findById(studentId);
    if (!student) throw new ApiError(404, "Student not found.");

    const current = await Enrollment.findOne({
      student: student._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    });

    if (current && String(current.classroom) === String(classroom._id)) {
      throw new ApiError(409, "This child is already in this classroom.");
    }

    /*
     * A child sits in one room at a time - the database enforces it with a
     * partial unique index on ACTIVE enrolments. So a move is: close the old
     * row as TRANSFERRED, then open the new one. Closing first is what keeps
     * the insert from colliding with that index.
     */
    if (current) {
      current.status = ENROLLMENT_STATUS.TRANSFERRED;
      current.endedAt = new Date();
      current.note = `Transferred to ${classroom.name}`;
      await current.save();
    }

    await Enrollment.create({
      student: student._id,
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
      enrolledAt: new Date(),
      createdBy: session.userId,
    });

    const usedSeats = await Enrollment.countDocuments({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    });

    return ok(
      {
        enrolled: true,
        transferred: Boolean(current),
        usedSeats,
        // Reported, not enforced: see the note on Classroom.capacity for why a
        // room is allowed to run over.
        overCapacity: usedSeats > classroom.capacity,
      },
      201,
    );
  });
}

const WithdrawSchema = z.object({
  student: z.string().min(1, "Choose a child."),
  /** WITHDRAWN (left the school) or GRADUATED (moved up out of nursery). */
  status: z
    .enum([ENROLLMENT_STATUS.WITHDRAWN, ENROLLMENT_STATUS.GRADUATED])
    .default(ENROLLMENT_STATUS.WITHDRAWN),
  note: z.string().trim().optional(),
});

export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/classrooms/[id]/students">,
) {
  return handle(async () => {
    await requirePermission("enrollment:remove");
    const { id } = await context.params;
    const classroom = await findClassroomOr404(id);
    const input = await parseBody(request, WithdrawSchema);

    const enrollment = await Enrollment.findOne({
      classroom: classroom._id,
      student: input.student,
      status: ENROLLMENT_STATUS.ACTIVE,
    });
    if (!enrollment) {
      throw new ApiError(404, "That child is not currently in this classroom.");
    }

    // Closed, never deleted - the row is the history that attendance and daily
    // sheets hang off.
    enrollment.status = input.status;
    enrollment.endedAt = new Date();
    if (input.note) enrollment.note = input.note;
    await enrollment.save();

    return ok({
      success: true,
      usedSeats: await Enrollment.countDocuments({
        classroom: classroom._id,
        status: ENROLLMENT_STATUS.ACTIVE,
      }),
    });
  });
}
