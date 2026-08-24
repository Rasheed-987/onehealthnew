import mongoose from "mongoose";
import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { UpdateParentSchema, toParentRow } from "@/lib/parents";
import { isObjectId } from "@/lib/teachers";
import { Parent, Student, User } from "@/models";

async function findParentOr404(id: string) {
  if (!isObjectId(id)) throw new ApiError(400, "That is not a valid parent id.");
  const parent = await Parent.findById(id).populate<{
    user: InstanceType<typeof User>;
  }>("user");
  if (!parent) throw new ApiError(404, "Parent not found.");
  return parent;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/parents/[id]">,
) {
  return handle(async () => {
    await requirePermission("parent:update");
    const { id } = await context.params;
    const parent = await findParentOr404(id);

    const students = await Student.find({ "guardians.parent": parent._id });
    return ok({ parent: toParentRow(parent.toObject(), students) });
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/parents/[id]">,
) {
  return handle(async () => {
    await requirePermission("parent:update");
    const { id } = await context.params;
    const input = await parseBody(request, UpdateParentSchema);
    const parent = await findParentOr404(id);

    // Spans User (name, phone, status) and Parent (the rest), so it runs in a
    // transaction rather than risking a half-applied edit.
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const userSet: Record<string, unknown> = {};
        const userUnset: Record<string, ""> = {};
        if (input.firstName !== undefined) userSet.firstName = input.firstName;
        if (input.lastName !== undefined) userSet.lastName = input.lastName;
        if (input.status !== undefined) userSet.status = input.status;
        // "" clears. Storing "" would leave the UI special-casing an empty
        // string as "no number".
        if (input.phone !== undefined) {
          if (input.phone) userSet.phone = input.phone;
          else userUnset.phone = "";
        }

        if (
          (Object.keys(userSet).length || Object.keys(userUnset).length) &&
          parent.user
        ) {
          await User.updateOne(
            { _id: parent.user._id },
            {
              ...(Object.keys(userSet).length ? { $set: userSet } : {}),
              ...(Object.keys(userUnset).length ? { $unset: userUnset } : {}),
            },
            { session: dbSession, runValidators: true },
          );
        }

        const set: Record<string, unknown> = {};
        const unset: Record<string, ""> = {};
        for (const field of ["occupation", "address", "emergencyPhone"] as const) {
          const value = input[field];
          if (value === undefined) continue;
          if (value) set[field] = value;
          else unset[field] = "";
        }

        if (Object.keys(set).length || Object.keys(unset).length) {
          await Parent.updateOne(
            { _id: parent._id },
            {
              ...(Object.keys(set).length ? { $set: set } : {}),
              ...(Object.keys(unset).length ? { $unset: unset } : {}),
            },
            { session: dbSession, runValidators: true },
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const updated = await findParentOr404(id);
    const students = await Student.find({ "guardians.parent": updated._id });
    return ok({ parent: toParentRow(updated.toObject(), students) });
  });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/parents/[id]">,
) {
  return handle(async () => {
    await requirePermission("parent:delete");
    const { id } = await context.params;
    const parent = await findParentOr404(id);

    /*
     * Refuse while they are still a guardian on a child.
     *
     * Cascading would silently strip a name off a child's contact list, and a
     * nursery pupil left with no reachable guardian is the worst possible
     * outcome of a stray click. The admin is told which children to sort out
     * first; suspending the account is the softer option and stays available.
     */
    const students = await Student.find({ "guardians.parent": parent._id });
    if (students.length > 0) {
      throw new ApiError(
        409,
        "This parent is still listed as a guardian. Remove them from the children first.",
        {
          children: students.map((s) => `${s.firstName} ${s.lastName}`.trim()),
        },
      );
    }

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await Parent.deleteOne({ _id: parent._id }, { session: dbSession });
        if (parent.user) {
          await User.deleteOne({ _id: parent.user._id }, { session: dbSession });
        }
      });
    } finally {
      await dbSession.endSession();
    }

    return ok({ success: true });
  });
}
