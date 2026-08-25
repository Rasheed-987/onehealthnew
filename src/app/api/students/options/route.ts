import { handle, ok, requirePermission } from "@/lib/api";
import { ageFrom } from "@/lib/students";
import { Enrollment, Parent, Student, User } from "@/models";
import { ENROLLMENT_STATUS } from "@/models/enums";

/**
 * Children available to seat, for the roster picker.
 *
 * Each one is annotated with the room they are currently in, so the person
 * enrolling can see that picking them means a transfer rather than a fresh
 * placement. Children already in THIS room are excluded by the caller.
 */
export async function GET() {
  return handle(async () => {
    await requirePermission("enrollment:assign");

    const students = await Student.find({ isActive: true })
      .sort({ lastName: 1, firstName: 1 })
      .limit(500);

    const seats = await Enrollment.find({
      student: { $in: students.map((s) => s._id) },
      status: ENROLLMENT_STATUS.ACTIVE,
    });
    const seatFor = new Map(seats.map((e) => [String(e.student), e]));

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

    return ok({
      students: students.map((student) => {
        const seat = seatFor.get(String(student._id));
        const parentNames = (student.guardians ?? [])
          .map((g) => parentNameMap.get(String(g.parent)))
          .filter(Boolean)
          .join(", ");

        return {
          id: String(student._id),
          fullName: `${student.firstName} ${student.lastName}`.trim(),
          age: ageFrom(student.dateOfBirth),
          parentName: parentNames || null,
          currentClassroomId: seat ? String(seat.classroom) : null,
        };
      }),
    });
  });
}
