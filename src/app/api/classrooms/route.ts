import { z } from "zod";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import { escapeRegex } from "@/lib/teachers";
import { classroomScopeFilter } from "@/lib/classroomScope";
import {
  CreateClassroomSchema,
  decorateClassrooms,
} from "@/lib/classrooms";
import { Classroom } from "@/models";

const ListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  return handle(async () => {
    const session = await requirePermission("classroom:list");

    const url = new URL(request.url);
    const { search, page, perPage } = ListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    /*
     * Scoped, not filtered by a `mine=1` flag the caller opts into: every role
     * may `classroom:list`, so without this a teacher's "my classrooms" screen
     * and a guardian's room list are both the whole school. Making it a flag
     * would mean the safe behaviour depends on the client remembering to ask.
     *
     * The super admin gets `{}` and the query is unchanged.
     */
    const filter: Record<string, unknown> = await classroomScopeFilter(session);
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: pattern }, { roomNumber: pattern }];
    }

    const [classrooms, total] = await Promise.all([
      Classroom.find(filter)
        .sort({ name: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Classroom.countDocuments(filter),
    ]);

    return ok({
      classrooms: await decorateClassrooms(classrooms),
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
    const session = await requirePermission("classroom:create");
    const input = await parseBody(request, CreateClassroomSchema);

    // save() via create() runs the pre('validate') hook that forbids a
    // duplicate teacher and a second lead - the same rules the Zod schema
    // checks, kept in both places because the hook also guards direct writes.
    const classroom = await Classroom.create({
      name: input.name,
      gradeLevel: input.gradeLevel,
      roomNumber: input.roomNumber,
      capacity: input.capacity,
      teachers: input.teachers,
      createdBy: session.userId,
    });

    const [row] = await decorateClassrooms([classroom]);
    return ok({ classroom: row }, 201);
  });
}
