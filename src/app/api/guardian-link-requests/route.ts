import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  CreateLinkRequestSchema,
  ListQuerySchema,
  type GuardianLinkRequestRow,
} from "@/lib/guardianLinks";
import { parentProfileId } from "@/lib/studentScope";
import { escapeRegex } from "@/lib/teachers";
import {
  Classroom,
  Enrollment,
  GuardianLinkRequest,
  Parent,
  Student,
  User,
  type IGuardianLinkRequest,
  type IUser,
} from "@/models";
import {
  ENROLLMENT_STATUS,
  GUARDIAN_LINK_STATUS,
  USER_ROLE,
  USER_STATUS,
} from "@/models/enums";

/**
 * The review queue for guardians who asked to be linked to a child.
 *
 * A guardian files one of these by registering in the app with their child's
 * student ID, or - once they already have an account - by adding a sibling from
 * inside it. Neither grants anything; see the approve route for the only write
 * that does.
 */

/**
 * Loads everything the rows need in a fixed number of queries, whatever the
 * page size - the same shape as `decorate` on the students route.
 */
async function decorate(
  requests: IGuardianLinkRequest[],
): Promise<GuardianLinkRequestRow[]> {
  if (requests.length === 0) return [];

  const [parents, students] = await Promise.all([
    Parent.find({ _id: { $in: requests.map((r) => r.parent) } }).populate<{
      user: IUser | null;
    }>("user"),
    Student.find({ _id: { $in: requests.map((r) => r.student) } }),
  ]);

  const enrollments = await Enrollment.find({
    student: { $in: students.map((s) => s._id) },
    status: ENROLLMENT_STATUS.ACTIVE,
  });
  const classrooms = await Classroom.find({
    _id: { $in: enrollments.map((e) => e.classroom) },
  });

  const parentById = new Map(parents.map((p) => [String(p._id), p]));
  const studentById = new Map(students.map((s) => [String(s._id), s]));
  const roomByStudent = new Map(
    enrollments.map((e) => [
      String(e.student),
      classrooms.find((c) => String(c._id) === String(e.classroom))?.name ??
        null,
    ]),
  );

  return requests.map((request) => {
    const parent = parentById.get(String(request.parent));
    const user = parent?.user;
    const student = studentById.get(String(request.student));

    return {
      id: String(request._id),
      status: request.status,
      relationship: request.relationship,
      studentIdTyped: request.studentIdTyped,
      requestedAt: request.createdAt.toISOString(),
      decidedAt: request.decidedAt?.toISOString() ?? null,
      note: request.note ?? null,
      parent: {
        id: String(request.parent),
        name: user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown",
        email: user?.email ?? "",
        phone: user?.phone ?? null,
      },
      student: student
        ? {
            id: String(student._id),
            fullName: `${student.firstName} ${student.lastName}`.trim(),
            studentId: student.studentId ?? null,
            classroom: roomByStudent.get(String(student._id)) ?? null,
          }
        : null,
    };
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    await requirePermission("guardianLink:list");

    const url = new URL(request.url);
    const { status, page, perPage } = ListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    /*
     * Only guardians who have proved their mailbox appear here.
     *
     * A registration that stops at the code screen leaves an INVITED account
     * behind, and anybody can start one against an address they do not own.
     * Showing those would put a request in front of staff whose name and email
     * are simply a claim - and the approve button next to it writes real access
     * to a real child. Verifying the address is what makes the name on the row
     * mean anything, so the queue waits for it.
     */
    const verifiedParentIds = await Parent.find({
      user: {
        $in: await User.find({
          role: USER_ROLE.PARENT,
          status: USER_STATUS.ACTIVE,
        }).distinct("_id"),
      },
    }).distinct("_id");

    const filter = { status, parent: { $in: verifiedParentIds } };

    const [requests, total] = await Promise.all([
      GuardianLinkRequest.find(filter)
        // Oldest first: this is a queue of people waiting.
        .sort({ createdAt: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      GuardianLinkRequest.countDocuments(filter),
    ]);

    return ok({
      requests: await decorate(requests),
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
 * A guardian who already has an account asking for another child.
 *
 * The sibling case, and the reason it needs its own route: the registration
 * route refuses an email that is already ACTIVE, so without this a family with
 * two children would have to invent a second email address.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requirePermission("guardianLink:create");
    const { studentId } = await parseBody(request, CreateLinkRequestSchema);

    const parentId = await parentProfileId(session);

    // Case-insensitive and ambiguity-refusing, exactly as on registration -
    // see the note on `findStudentByTypedId` there for why both matter.
    const pattern = new RegExp(`^${escapeRegex(studentId)}$`, "i");
    const matches = await Student.find({ studentId: pattern }).limit(2);
    const student = matches.length === 1 ? matches[0] : null;

    if (!student) {
      const message =
        "We could not find a child with that student ID. Check it with the school.";
      throw new ApiError(400, message, { studentId: message });
    }

    if (student.guardians.some((g) => String(g.parent) === String(parentId))) {
      throw new ApiError(409, "You are already linked to this child.", {
        studentId: "You already have access to this child.",
      });
    }

    // Checked here rather than left to the partial unique index, whose E11000
    // would surface as "that parent is already taken" - a field nobody typed.
    const pending = await GuardianLinkRequest.findOne({
      parent: parentId,
      student: student._id,
      status: GUARDIAN_LINK_STATUS.PENDING,
    });
    if (pending) {
      throw new ApiError(
        409,
        "You have already asked for access to this child. The school is reviewing it.",
        { studentId: "This request is already with the school." },
      );
    }

    await GuardianLinkRequest.create({
      parent: parentId,
      student: student._id,
      studentIdTyped: studentId,
      status: GUARDIAN_LINK_STATUS.PENDING,
    });

    /*
     * Deliberately says nothing about the child - not their name, not their
     * class. The caller has proved only that they know a student ID, and
     * echoing back who it belongs to would turn this route into a lookup for
     * anyone with an account and a list of numbers to try.
     */
    return ok(
      {
        message:
          "Your request has been sent to the school. You will see your child here once it is approved.",
      },
      201,
    );
  });
}
