import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  UpdateClassroomSchema,
  decorateClassrooms,
} from "@/lib/classrooms";
import { isObjectId } from "@/lib/teachers";
import { Classroom, Enrollment } from "@/models";
import { ENROLLMENT_STATUS } from "@/models/enums";

async function findClassroomOr404(id: string) {
  if (!isObjectId(id)) {
    throw new ApiError(400, "That is not a valid classroom id.");
  }
  const classroom = await Classroom.findById(id);
  if (!classroom) throw new ApiError(404, "Classroom not found.");
  return classroom;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/classrooms/[id]">,
) {
  return handle(async () => {
    await requirePermission("classroom:list");
    const { id } = await context.params;
    const classroom = await findClassroomOr404(id);
    const [row] = await decorateClassrooms([classroom]);
    return ok({ classroom: row });
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/classrooms/[id]">,
) {
  return handle(async () => {
    await requirePermission("classroom:update");
    const { id } = await context.params;
    const classroom = await findClassroomOr404(id);
    const input = await parseBody(request, UpdateClassroomSchema);

    if (input.name !== undefined) classroom.name = input.name;
    if (input.gradeLevel !== undefined) classroom.gradeLevel = input.gradeLevel;
    if (input.capacity !== undefined) classroom.capacity = input.capacity;
    if (input.isActive !== undefined) classroom.isActive = input.isActive;
    if (input.roomNumber !== undefined) {
      classroom.roomNumber = input.roomNumber || undefined;
    }
    if (input.teachers !== undefined) {
      // Sent whole - the form always submits the complete roster, so a removed
      // teacher is simply absent.
      classroom.teachers = input.teachers.map((t) => ({
        teacher: t.teacher as unknown as (typeof classroom.teachers)[number]["teacher"],
        role: t.role,
        assignedAt: new Date(),
      }));
    }

    // save(), not updateOne(): the pre('validate') hook enforcing one lead and
    // no duplicate teacher only runs on a document save.
    await classroom.save();

    const [row] = await decorateClassrooms([classroom]);
    return ok({ classroom: row });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/classrooms/[id]">,
) {
  return handle(async () => {
    await requirePermission("classroom:delete");
    const { id } = await context.params;
    const classroom = await findClassroomOr404(id);

    /*
     * Refuse while children are still seated.
     *
     * Attendance lines and daily sheets resolve a room through the enrolment,
     * so deleting the classroom under an active roster would strand that
     * history. Withdrawing or transferring the children first is the
     * deliberate act that closes it properly.
     */
    const seated = await Enrollment.countDocuments({
      classroom: classroom._id,
      status: ENROLLMENT_STATUS.ACTIVE,
    });
    if (seated > 0) {
      throw new ApiError(
        409,
        `This classroom still has ${seated} ${
          seated === 1 ? "child" : "children"
        } enrolled. Move them out first.`,
        { seated },
      );
    }

    await Classroom.deleteOne({ _id: classroom._id });
    return ok({ success: true });
  });
}
