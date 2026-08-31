import mongoose from "mongoose";
import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { adminDisplayName, sendInviteAfterCreate } from "@/lib/accountAccess";
import {
  resolveGuardians,
  type CreatedGuardianAccount,
} from "@/lib/guardians";
import { UpdateStudentSchema, toStudentRow } from "@/lib/students";
import {
  assertGuardianEditAllowed,
  findStudentInScope,
} from "@/lib/studentScope";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment, Parent, Student, User } from "@/models";
import { ENROLLMENT_STATUS, USER_ROLE, USER_STATUS } from "@/models/enums";

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

    if (input.guardians !== undefined) {
      // Staff-only to CHANGE: a guardian submitting this form would otherwise
      // remove the co-guardian the school added, or themselves. Resubmitting
      // the same list unchanged is fine, which is what a parent editing their
      // own child's details does.
      assertGuardianEditAllowed(session, student.guardians, input.guardians);
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
    /*
     * Clearing has to REMOVE the path, not store "": the unique index is keyed
     * on `studentId` being a string, so a second child cleared to an empty
     * string would collide with the first. `|| undefined` is what makes a blank
     * disappear from the index entirely.
     */
    if (input.studentId !== undefined) {
      student.studentId = input.studentId || undefined;
    }
    if (input.medicalNotes !== undefined) {
      student.medicalNotes = input.medicalNotes || undefined;
    }
    /*
     * Guardians are sent whole - the form always submits the complete list, so
     * a removed guardian is simply absent rather than needing its own
     * operation - and a row may name someone who has no account yet. That is
     * the second-parent case: a father asking for access months after the
     * child enrolled is added here, on the child, not on a separate screen.
     *
     * save() rather than updateOne() throughout, so the pre('validate') hook
     * that forbids a duplicate or empty guardian list actually runs.
     */
    let created: CreatedGuardianAccount[] = [];
    if (input.guardians !== undefined) {
      const guardians = input.guardians;
      const dbSession = await mongoose.startSession();
      try {
        await dbSession.withTransaction(async () => {
          const resolved = await resolveGuardians(
            guardians,
            session.userId,
            dbSession,
          );
          student.guardians = resolved.links.map((link) => ({
            parent: link.parent as unknown as (typeof student.guardians)[number]["parent"],
            relationship: link.relationship,
          }));
          await student.save({ session: dbSession });
          created = resolved.created;
        });
      } finally {
        await dbSession.endSession();
      }
    } else {
      await student.save();
    }

    // After the commit, for the same reason as on creation: an email cannot be
    // rolled back.
    const invitedBy =
      created.length > 0 ? await adminDisplayName(session.userId) : "";
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

    return ok({ student: await rowFor(student), invitations });
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
