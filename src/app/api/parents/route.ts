import mongoose from "mongoose";
import { z } from "zod";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { adminDisplayName, sendInviteAfterCreate } from "@/lib/accountAccess";
import {
  createParentAccount,
  type CreatedGuardianAccount,
} from "@/lib/guardians";
import { escapeRegex } from "@/lib/teachers";
import { CreateParentSchema, toParentRow, type ParentRow } from "@/lib/parents";
import { Parent, Student, User } from "@/models";
import { USER_ROLE, USER_STATUS } from "@/models/enums";

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  return handle(async () => {
    await requirePermission("parent:update");

    const url = new URL(request.url);
    const { search, page, perPage } = ListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const filter: Record<string, unknown> = {};

    if (search) {
      // Name and email live on User, so the text match resolves to user ids
      // first; occupation is the one searchable field on the profile itself.
      const pattern = new RegExp(escapeRegex(search), "i");
      const userIds = await User.find({
        role: USER_ROLE.PARENT,
        $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }],
      }).distinct("_id");

      filter.$or = [{ user: { $in: userIds } }, { occupation: pattern }];
    }

    const [parents, total] = await Promise.all([
      Parent.find(filter)
        .populate<{ user: InstanceType<typeof User> }>("user")
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Parent.countDocuments(filter),
    ]);

    // One query for every child of everyone on this page, rather than one per
    // row.
    const students = await Student.find({
      "guardians.parent": { $in: parents.map((p) => p._id) },
    });

    const rows: ParentRow[] = parents.map((parent) =>
      toParentRow(parent.toObject(), students),
    );

    return ok({
      parents: rows,
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
    const session = await requirePermission("parent:create");
    const input = await parseBody(request, CreateParentSchema);

    const existing = await User.findOne({ email: input.email });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists.", {
        email: "This email is already registered.",
      });
    }

    /*
     * User + Parent in one transaction. A failure on the second would
     * otherwise leave a User with role PARENT and no profile - invisible to
     * this screen and unreachable by any repair path.
     *
     * The pair is built by `createParentAccount` rather than inline, because
     * the enrolment sheet creates guardians the same way and the two must not
     * drift - see lib/guardians.ts.
     */
    const dbSession = await mongoose.startSession();
    let account: CreatedGuardianAccount | null = null;
    try {
      await dbSession.withTransaction(async () => {
        account = await createParentAccount(input, session.userId, dbSession);
      });
    } finally {
      await dbSession.endSession();
    }
    if (!account) throw new ApiError(500, "Parent could not be created.");
    const { userId, parentId } = account as CreatedGuardianAccount;

    const created = await Parent.findById(parentId).populate<{
      user: InstanceType<typeof User>;
    }>("user");
    if (!created) {
      throw new ApiError(500, "Parent could not be created.");
    }

    // Sent only after the transaction commits: an email cannot be rolled back,
    // so it must not go out for a record a later failure would undo.
    const invite = await sendInviteAfterCreate(
      {
        _id: userId,
        email: input.email,
        firstName: input.firstName,
        status: USER_STATUS.INVITED,
        role: USER_ROLE.PARENT,
      },
      await adminDisplayName(session.userId),
    );

    return ok({ parent: toParentRow(created.toObject()), ...invite }, 201);
  });
}
