import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { adminDisplayName, sendInviteAfterCreate } from "@/lib/accountAccess";
import {
  CreateTeacherSchema,
  escapeRegex,
  toTeacherRow,
  type TeacherRow,
} from "@/lib/teachers";
import { Classroom, Teacher, User } from "@/models";
import { USER_ROLE, USER_STATUS } from "@/models/enums";

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  /** "active" | "inactive" | undefined (= all) */
  status: z.enum(["active", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  return handle(async () => {
    await requirePermission("teacher:update");

    const url = new URL(request.url);
    const { search, status, page, perPage } = ListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    // Mongoose 9 no longer exports FilterQuery; the filter is assembled as
    // a plain object and handed to find() as-is.
    const filter: Record<string, unknown> = {};
    if (status) filter.isActive = status === "active";

    if (search) {
      // The searchable fields (name, email) live on User, so the text match
      // has to resolve to user ids first - there is no cross-collection
      // `$or` in a plain find().
      const pattern = new RegExp(escapeRegex(search), "i");
      const userIds = await User.find({
        role: USER_ROLE.TEACHER,
        $or: [
          { firstName: pattern },
          { lastName: pattern },
          { email: pattern },
        ],
      }).distinct("_id");

      filter.$or = [{ user: { $in: userIds } }, { employeeId: pattern }];
    }

    const [teachers, total] = await Promise.all([
      Teacher.find(filter)
        .populate<{ user: InstanceType<typeof User> }>("user")
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Teacher.countDocuments(filter),
    ]);

    // One query for every classroom these teachers sit on, rather than one
    // per row.
    const classrooms = await Classroom.find({
      "teachers.teacher": { $in: teachers.map((t) => t._id) },
    });

    const rows: TeacherRow[] = teachers.map((teacher) =>
      toTeacherRow(teacher.toObject(), classrooms),
    );

    return ok({
      teachers: rows,
      pagination: {
        page,
        perPage,
        total,
        pageCount: Math.max(1, Math.ceil(total / perPage)),
      },
    });
  });
}

/** URL-safe, ~16 characters. Shown to the admin once, never stored in clear. */
function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requirePermission("teacher:create");
    const input = await parseBody(request, CreateTeacherSchema);

    const existing = await User.findOne({ email: input.email });
    if (existing) {
      throw new ApiError(409, "An account with this email already exists.", {
        email: "This email is already registered.",
      });
    }

    /*
     * The account is created with a random password nobody is told. It exists
     * only because the schema requires one - the teacher never uses it, and
     * cannot, because the account stays INVITED until they redeem the emailed
     * link and choose their own.
     */
    const hashed = await hashPassword(generatePassword());

    /*
     * A teacher is two documents. Without a transaction a failure on the
     * second - a duplicate employeeId, say - would leave a User with role
     * TEACHER and no profile behind it, which nothing in the UI can see or
     * repair.
     */
    const dbSession = await mongoose.startSession();
    let teacherId: mongoose.Types.ObjectId | null = null;
    let userId: mongoose.Types.ObjectId | null = null;
    try {
      await dbSession.withTransaction(async () => {
        const [user] = await User.create(
          [
            {
              email: input.email,
              password: hashed,
              role: USER_ROLE.TEACHER,
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              // Cannot sign in until the invitation link is redeemed; the
              // login route refuses INVITED accounts.
              status: USER_STATUS.INVITED,
              createdBy: session.userId,
            },
          ],
          { session: dbSession },
        );

        const [teacher] = await Teacher.create(
          [
            {
              user: user._id,
              title: input.title,
              employeeId: input.employeeId,
              specialization: input.specialization,
              joinedAt: input.joinedAt ? new Date(input.joinedAt) : undefined,
              isActive: true,
              createdBy: session.userId,
            },
          ],
          { session: dbSession },
        );

        userId = user._id;
        teacherId = teacher._id;
      });
    } finally {
      await dbSession.endSession();
    }

    const created = await Teacher.findById(teacherId).populate<{
      user: InstanceType<typeof User>;
    }>("user");
    if (!created || !userId) {
      throw new ApiError(500, "Teacher could not be created.");
    }

    // Sent only after the transaction commits: an email cannot be rolled back,
    // so it must not go out for a record a later failure would undo.
    const invite = await sendInviteAfterCreate(
      {
        _id: userId,
        email: input.email,
        firstName: input.firstName,
        status: USER_STATUS.INVITED,
      },
      await adminDisplayName(session.userId),
    );

    return ok({ teacher: toTeacherRow(created.toObject()), ...invite }, 201);
  });
}
