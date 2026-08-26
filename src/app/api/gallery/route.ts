import type { NextRequest } from "next/server";

import { ApiError, handle, ok, requirePermission } from "@/lib/api";
import {
  CreateGalleryItemSchema,
  hydrateGalleryRows,
} from "@/lib/gallery";
import {
  resolveAudience,
  resolveCreditedTeacher,
  resolveGalleryScope,
} from "@/lib/galleryScope";
import { discardUpload, saveUpload } from "@/lib/media";
import { isObjectId } from "@/lib/teachers";
import { GalleryItem } from "@/models";
import { GALLERY_ITEM_TYPE } from "@/models/enums";

/**
 * The gallery: the guardian feed, and posting to it.
 *
 * Neither handler branches on role. `resolveGalleryScope` turns the session
 * into a filter once - the whole school for a super admin, their own rooms for
 * a teacher, and for a guardian the items tagged with one of their children.
 */

const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("gallery:list");
    const scope = await resolveGalleryScope(session);
    const params = request.nextUrl.searchParams;

    const filter: Record<string, unknown> = { ...scope.filter };

    /*
     * Narrowing by classroom or student is an AND on top of the scope, never a
     * replacement for it. A guardian passing another family's student id ends
     * up with `{ students: { $in: mine }, ...{ students: theirs } }` - so the
     * id is checked against their own list first and rejected.
     */
    const classroom = params.get("classroom");
    if (classroom) {
      if (!isObjectId(classroom)) {
        throw new ApiError(400, "That is not a valid classroom id.");
      }
      if (scope.classroomIds && !scope.classroomIds.includes(classroom)) {
        throw new ApiError(404, "Classroom not found.");
      }
      filter.classroom = classroom;
    }

    const student = params.get("student");
    if (student) {
      if (!isObjectId(student)) {
        throw new ApiError(400, "That is not a valid student id.");
      }
      const mine = scope.filter.students as { $in: string[] } | undefined;
      if (mine && !mine.$in.includes(student)) {
        throw new ApiError(404, "Student not found.");
      }
      filter.students = student;
    }

    const type = params.get("type");
    if (type) {
      if (!(Object.values(GALLERY_ITEM_TYPE) as string[]).includes(type)) {
        throw new ApiError(400, "That is not a valid gallery type.");
      }
      filter.type = type;
    }

    // Staff can ask to see soft-deleted posts; a guardian cannot, because
    // `isActive: true` is pinned into their scope filter and would be
    // overwritten here. Guard it explicitly rather than relying on key order.
    const includeInactive = params.get("includeInactive") === "true";
    if (includeInactive && scope.filter.isActive === undefined) {
      delete filter.isActive;
    } else if (!includeInactive) {
      filter.isActive = true;
    }

    const limit = Math.min(
      Math.max(Number(params.get("limit")) || 50, 1),
      MAX_LIMIT,
    );

    const items = await GalleryItem.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);

    return ok({
      scope: { role: session.role, classroomIds: scope.classroomIds },
      items: await hydrateGalleryRows(items),
    });
  });
}

/**
 * Posting a photo or clip.
 *
 * `multipart/form-data`, because the file comes off a phone camera. The other
 * fields ride alongside as text parts; `students` may repeat.
 *
 * Deliberately POST-only - see the note in `[id]/route.ts` on why PUT belongs
 * on a single item here and not on the collection.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("gallery:create");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(
        400,
        "Send this as multipart/form-data with a file attached.",
      );
    }

    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" && value.trim() !== ""
        ? value
        : undefined;
    };

    const input = CreateGalleryItemSchema.parse({
      title: text("title"),
      description: text("description"),
      type: text("type") ?? GALLERY_ITEM_TYPE.UPDATE,
      // Accepts repeated `students` parts, or one comma-separated value -
      // Postman makes the first awkward and mobile clients make the second.
      students: form
        .getAll("students")
        .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
        .map((v) => v.trim())
        .filter(Boolean),
      classroom: text("classroom"),
      teacher: text("teacher"),
      takenAt: text("takenAt"),
    });

    // Audience and permission first, file second: no point writing bytes to
    // disk for a post the caller was never allowed to make.
    const { students, classroom } = await resolveAudience(session, input);
    const teacher = await resolveCreditedTeacher(
      session,
      classroom,
      input.teacher,
    );

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Attach a photo or a video.", {
        file: "Attach a photo or a video.",
      });
    }
    const saved = await saveUpload(file);

    try {
      /*
       * `create` rather than an upsert, so the model's `pre("validate")` hook
       * actually runs - it is what rejects an untagged or double-tagged post.
       * Unlike attendance and daily progress there is no natural key here, so
       * nothing forces this into a findOneAndUpdate.
       */
      const item = await GalleryItem.create({
        title: input.title,
        description: input.description,
        type: input.type,
        mediaKind: saved.mediaKind,
        mediaUrl: saved.mediaUrl,
        teacher,
        students,
        classroom: classroom._id,
        takenAt: input.takenAt ? new Date(input.takenAt) : undefined,
        createdBy: session.userId,
      });

      const [row] = await hydrateGalleryRows([item]);
      return ok({ item: row }, 201);
    } catch (error) {
      // The row failed, so the file on disk is an orphan nobody references.
      await discardUpload(saved.mediaUrl);
      throw error;
    }
  });
}
