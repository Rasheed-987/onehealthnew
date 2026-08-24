import mongoose from "mongoose";
import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  UpdateTeacherSchema,
  isObjectId,
  toTeacherRow,
} from "@/lib/teachers";
import { Classroom, Teacher, User } from "@/models";

/** Loads the teacher with its user, or throws the right 400/404. */
async function findTeacherOr404(id: string) {
  if (!isObjectId(id)) throw new ApiError(400, "That is not a valid teacher id.");
  const teacher = await Teacher.findById(id).populate<{
    user: InstanceType<typeof User>;
  }>("user");
  if (!teacher) throw new ApiError(404, "Teacher not found.");
  return teacher;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/teachers/[id]">,
) {
  return handle(async () => {
    await requirePermission("teacher:update");
    const { id } = await context.params;
    const teacher = await findTeacherOr404(id);

    const classrooms = await Classroom.find({ "teachers.teacher": teacher._id });
    return ok({ teacher: toTeacherRow(teacher.toObject(), classrooms) });
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/teachers/[id]">,
) {
  return handle(async () => {
    await requirePermission("teacher:update");
    const { id } = await context.params;
    const input = await parseBody(request, UpdateTeacherSchema);
    const teacher = await findTeacherOr404(id);

    /*
     * The edit spans both documents - name/phone/status live on User, the rest
     * on Teacher - so it runs in a transaction. Half-applied edits are the
     * failure mode this avoids: a renamed user whose profile kept the old
     * employee number.
     */
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const userUpdate: Record<string, unknown> = {};
        const userUnset: Record<string, ""> = {};
        if (input.firstName !== undefined) userUpdate.firstName = input.firstName;
        if (input.lastName !== undefined) userUpdate.lastName = input.lastName;
        if (input.status !== undefined) userUpdate.status = input.status;
        // "" means clear. Storing "" instead would leave an empty string the
        // UI has to keep special-casing as "no phone number".
        if (input.phone !== undefined) {
          if (input.phone) userUpdate.phone = input.phone;
          else userUnset.phone = "";
        }

        if (
          (Object.keys(userUpdate).length > 0 ||
            Object.keys(userUnset).length > 0) &&
          teacher.user
        ) {
          await User.updateOne(
            { _id: teacher.user._id },
            {
              ...(Object.keys(userUpdate).length ? { $set: userUpdate } : {}),
              ...(Object.keys(userUnset).length ? { $unset: userUnset } : {}),
            },
            { session: dbSession, runValidators: true },
          );
        }

        const teacherUpdate: Record<string, unknown> = {};
        const unset: Record<string, ""> = {};
        if (input.title !== undefined) teacherUpdate.title = input.title;
        if (input.isActive !== undefined) teacherUpdate.isActive = input.isActive;

        if (input.specialization !== undefined) {
          if (input.specialization) {
            teacherUpdate.specialization = input.specialization;
          } else unset.specialization = "";
        }
        if (input.joinedAt !== undefined) {
          if (input.joinedAt) teacherUpdate.joinedAt = new Date(input.joinedAt);
          else unset.joinedAt = "";
        }
        /*
         * A cleared employeeId must be $unset, never set to "" or null. The
         * unique index on it is sparse, so it ignores missing values but would
         * happily collide two teachers who both store an empty string.
         */
        if (input.employeeId !== undefined) {
          if (input.employeeId) teacherUpdate.employeeId = input.employeeId;
          else unset.employeeId = "";
        }

        if (Object.keys(teacherUpdate).length > 0 || Object.keys(unset).length) {
          await Teacher.updateOne(
            { _id: teacher._id },
            {
              ...(Object.keys(teacherUpdate).length
                ? { $set: teacherUpdate }
                : {}),
              ...(Object.keys(unset).length ? { $unset: unset } : {}),
            },
            { session: dbSession, runValidators: true },
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const updated = await findTeacherOr404(id);
    const classrooms = await Classroom.find({ "teachers.teacher": updated._id });
    return ok({ teacher: toTeacherRow(updated.toObject(), classrooms) });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/teachers/[id]">,
) {
  return handle(async () => {
    await requirePermission("teacher:delete");
    const { id } = await context.params;
    const teacher = await findTeacherOr404(id);

    /*
     * Refuse rather than cascade. Removing a teacher who is still on a
     * classroom would silently leave that room without a lead, so the admin is
     * told which rooms to reassign first. Deactivating (PATCH isActive:false)
     * is the softer option and stays available.
     */
    const classrooms = await Classroom.find({ "teachers.teacher": teacher._id });
    if (classrooms.length > 0) {
      throw new ApiError(
        409,
        "This teacher is still assigned to a classroom. Remove them from it first.",
        { classrooms: classrooms.map((room) => room.name) },
      );
    }

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await Teacher.deleteOne({ _id: teacher._id }, { session: dbSession });
        if (teacher.user) {
          await User.deleteOne(
            { _id: teacher.user._id },
            { session: dbSession },
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    return ok({ success: true });
  });
}
