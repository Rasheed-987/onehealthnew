import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { UpdateStudentSchema, toStudentRow } from "@/lib/students";
import {
  assertGuardianListAllowed,
  findStudentInScope,
} from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Parent, Student, User } from "@/models";
import { ENROLLMENT_STATUS } from "@/models/enums";

async function rowFor(student: InstanceType<typeof Student>) {
  const [parents, enrollments] = await Promise.all([
    Parent.find({
      _id: { $in: student.guardians.map((g) => g.parent) },
    }).populate<{ user: InstanceType<typeof User> }>("user"),
    Enrollment.find({ student: student._id, status: ENROLLMENT_STATUS.ACTIVE }),
  ]);
  const classrooms = await Classroom.find({
    _id: { $in: enrollments.map((e) => e.classroom) },
  });
  return toStudentRow(
    student.toObject(),
    parents.map((p) => p.toObject()),
    enrollments,
    classrooms,
  );
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/students/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("student:list");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid student id.");
    }
    const student = await findStudentInScope(session, id);
    return ok({ student: await rowFor(student) });
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/students/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("student:update");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid student id.");
    }
    // Scoped: a guardian editing someone else's child gets a 404, not a 403.
    const student = await findStudentInScope(session, id);
    const input = await parseBody(request, UpdateStudentSchema);

    if (input.guardians) {
      // Stops a guardian from editing themselves off their own child, which
      // would leave a record they can no longer see or correct.
      await assertGuardianListAllowed(session, input.guardians);
    }

    if (input.firstName !== undefined) student.firstName = input.firstName;
    if (input.lastName !== undefined) student.lastName = input.lastName;
    if (input.gender !== undefined) student.gender = input.gender;
    if (input.isActive !== undefined) student.isActive = input.isActive;
    if (input.dateOfBirth !== undefined) {
      student.dateOfBirth = new Date(input.dateOfBirth);
    }
    // "" clears; `undefined` on a Mongoose path removes it on save.
    if (input.nationality !== undefined) {
      student.nationality = input.nationality || undefined;
    }
    if (input.medicalNotes !== undefined) {
      student.medicalNotes = input.medicalNotes || undefined;
    }
    if (input.guardians !== undefined) {
      // Sent whole: the form always submits the complete list, so a removed
      // guardian is simply absent rather than needing its own operation.
      student.guardians = input.guardians.map((g) => ({
        parent: g.parent as unknown as (typeof student.guardians)[number]["parent"],
        relationship: g.relationship,
      }));
    }

    // save() rather than updateOne(), so the pre('validate') hook that forbids
    // the same parent twice actually runs.
    await student.save();

    return ok({ student: await rowFor(student) });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/students/[id]">,
) {
  return handle(async () => {
    await requirePermission("student:delete");
    const { id } = await context.params;
    if (!isObjectId(id)) {
      throw new ApiError(400, "That is not a valid student id.");
    }
    const student = await Student.findById(id);
    if (!student) throw new ApiError(404, "Student not found.");

    /*
     * Refuse while the child still holds a seat.
     *
     * Deleting would orphan the enrolment, and with it every attendance line
     * and daily sheet that resolves a classroom through it. Withdrawing the
     * child from the room first is the deliberate act that closes that
     * history properly.
     */
    const seat = await Enrollment.findOne({
      student: student._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    });
    if (seat) {
      const room = await Classroom.findById(seat.classroom);
      throw new ApiError(
        409,
        "This child is still enrolled in a classroom. Withdraw them first.",
        { classroom: room?.name ?? "a classroom" },
      );
    }

    await Student.deleteOne({ _id: student._id });
    return ok({ success: true });
  });
}
