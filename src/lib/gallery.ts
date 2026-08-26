import { z } from "zod";

import {
  GALLERY_ITEM_TYPE,
  GALLERY_ITEM_TYPE_LABEL,
  type GalleryItemType,
  type MediaKind,
} from "@/models/enums";
import { Classroom, Student, Teacher, User } from "@/models";
import type {
  IClassroom,
  IGalleryItem,
  IStudent,
  ITeacher,
  IUser,
} from "@/models";

/**
 * Shapes shared by the gallery routes and the screens that call them.
 *
 * The one idea worth holding on to: `students` is the AUDIENCE, not a caption.
 * An item is readable by the guardians of the children tagged on it and by
 * nobody else, which is why the model refuses an untagged post outright. So
 * the two things a teacher wants to do are the same operation with different
 * tag counts:
 *
 *   "a photo of the whole room"  -> tag every child actively enrolled in it
 *   "a photo of one child"       -> tag that child
 *
 * There is no visibility flag to get wrong, and no way for a guardian to be
 * shown a picture of a child who is not theirs.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

/**
 * Posting a photo.
 *
 * The audience is exactly one of `students` or `classroom`. `classroom` is the
 * shorthand for "everyone in this room right now" and is expanded to explicit
 * tags at write time - see `resolveAudience`. It is deliberately expanded
 * rather than stored as a live audience: a child who joins the room next month
 * should not suddenly be able to see photos of children they have never met,
 * and a child who leaves should keep the pictures they are actually in.
 */
export const CreateGalleryItemSchema = z
  .object({
    title: optionalText,
    description: optionalText,
    type: z.enum(GALLERY_ITEM_TYPE).default(GALLERY_ITEM_TYPE.UPDATE),
    students: z.array(z.string().min(1)).optional(),
    classroom: z.string().min(1).optional(),
    /** Credit a specific teacher. Defaults to the caller, or the room's lead. */
    teacher: z.string().min(1).optional(),
    takenAt: z
      .string()
      .trim()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.")
      .optional(),
  })
  /*
   * Exactly one, enforced here rather than left to `resolveAudience`. Neither
   * is a post nobody could ever see; both is an ambiguous instruction that
   * would otherwise be resolved silently in the classroom's favour, quietly
   * tagging children the caller did not name.
   */
  .refine(
    (input) => Boolean(input.students?.length) !== Boolean(input.classroom),
    {
      path: ["students"],
      message:
        "Choose either a classroom or a list of children - one or the other, not both and not neither.",
    },
  );
export type CreateGalleryItemInput = z.infer<typeof CreateGalleryItemSchema>;

/**
 * Editing an existing post.
 *
 * The media itself is not editable - a different photo is a different post,
 * and swapping the file under a post that guardians have already seen is not
 * something the school should be able to do quietly.
 */
export const UpdateGalleryItemSchema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  type: z.enum(GALLERY_ITEM_TYPE).optional(),
  /** Re-tagging changes who can see the post, so it is allowed but audited. */
  students: z.array(z.string().min(1)).min(1).optional(),
  takenAt: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.")
    .optional(),
  isActive: z.boolean().optional(),
});
export type UpdateGalleryItemInput = z.infer<typeof UpdateGalleryItemSchema>;

export interface GalleryItemRow {
  id: string;
  title: string | null;
  description: string | null;
  type: GalleryItemType;
  typeLabel: string;
  mediaKind: MediaKind;
  mediaUrl: string;
  thumbnailUrl: string | null;
  /** Who this is of, and therefore who may see it. */
  students: { id: string; fullName: string }[];
  /** A filing label for staff. It does NOT widen the audience. */
  classroom: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  takenAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export function toGalleryRow(
  item: IGalleryItem,
  students: Map<string, IStudent>,
  classrooms: Map<string, IClassroom>,
  teachers: Map<string, { teacher: ITeacher; user: IUser | null }>,
): GalleryItemRow {
  const classroom = item.classroom
    ? classrooms.get(String(item.classroom))
    : undefined;
  const credited = teachers.get(String(item.teacher));

  return {
    id: String(item._id),
    title: item.title ?? null,
    description: item.description ?? null,
    type: item.type,
    typeLabel: GALLERY_ITEM_TYPE_LABEL[item.type],
    mediaKind: item.mediaKind,
    mediaUrl: item.mediaUrl,
    thumbnailUrl: item.thumbnailUrl ?? null,
    students: item.students.map((id) => {
      const student = students.get(String(id));
      return {
        id: String(id),
        fullName: student
          ? `${student.firstName} ${student.lastName}`.trim()
          : "Unknown",
      };
    }),
    classroom: classroom
      ? { id: String(classroom._id), name: classroom.name }
      : null,
    teacher: credited
      ? {
          id: String(item.teacher),
          name: credited.user
            ? `${credited.teacher.title} ${credited.user.firstName} ${credited.user.lastName}`.trim()
            : "Unknown",
        }
      : null,
    takenAt: item.takenAt ? item.takenAt.toISOString() : null,
    isActive: item.isActive,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Fills in the names an item refers to by id.
 *
 * Four `$in` lookups rather than `populate`, for the same reason as the
 * attendance and progress hydrators: the same children and the same teacher
 * recur across a whole page of the feed.
 */
export async function hydrateGalleryRows(
  items: IGalleryItem[],
): Promise<GalleryItemRow[]> {
  if (items.length === 0) return [];

  const ids = <T,>(values: T[]) =>
    Array.from(new Set(values.filter(Boolean).map(String)));

  const [students, classrooms, teachers] = await Promise.all([
    Student.find({ _id: { $in: ids(items.flatMap((i) => i.students)) } }),
    Classroom.find({ _id: { $in: ids(items.map((i) => i.classroom)) } }),
    Teacher.find({ _id: { $in: ids(items.map((i) => i.teacher)) } }),
  ]);

  const users = await User.find({
    _id: { $in: ids(teachers.map((t) => t.user)) },
  });
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const byId = <T extends { _id: unknown }>(docs: T[]) =>
    new Map(docs.map((d) => [String(d._id), d]));

  const teacherMap = new Map(
    teachers.map((t) => [
      String(t._id),
      { teacher: t as ITeacher, user: userById.get(String(t.user)) ?? null },
    ]),
  );

  return items.map((item) =>
    toGalleryRow(
      item,
      byId(students) as Map<string, IStudent>,
      byId(classrooms) as Map<string, IClassroom>,
      teacherMap as Map<string, { teacher: ITeacher; user: IUser | null }>,
    ),
  );
}
