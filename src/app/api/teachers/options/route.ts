import { handle, ok, requirePermission } from "@/lib/api";
import { teacherDisplayName } from "@/lib/classrooms";
import { Teacher, User } from "@/models";

/**
 * A minimal teacher list for the classroom form's roster picker.
 *
 * Gated on `classroom:update` rather than `teacher:update`, because teachers
 * may run their own rooms and therefore need to name colleagues, but must not
 * be able to read staff records. Returns a name and nothing else.
 *
 * `options` is a static segment, so it wins over the sibling `[id]` route.
 */
export async function GET() {
  return handle(async () => {
    await requirePermission("classroom:update");

    const teachers = await Teacher.find({ isActive: true })
      .populate<{ user: InstanceType<typeof User> }>("user")
      .limit(500);

    return ok({
      teachers: teachers
        .filter((teacher) => teacher.user)
        .map((teacher) => ({
          id: String(teacher._id),
          name: teacherDisplayName(teacher.toObject()),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  });
}
