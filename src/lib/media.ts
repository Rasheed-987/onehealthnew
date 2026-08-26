import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { ApiError } from "@/lib/api";
import { MEDIA_KIND, type MediaKind } from "@/models/enums";

/**
 * Saving an uploaded photo or clip to disk.
 *
 * Files land in `public/uploads`, which Next serves directly, so the stored
 * `mediaUrl` is just `/uploads/<name>`.
 *
 * KNOWN LIMIT, chosen deliberately: this only works on a host with a writable,
 * persistent filesystem. On Vercel and most serverless platforms the app
 * directory is read-only and anything written is gone on the next deploy, so
 * moving to Cloudinary or S3 means replacing this one module - which is why
 * every route talks to `saveUpload` rather than to `fs` directly.
 */

/**
 * What a guardian's phone should be able to open, and nothing else.
 *
 * An allowlist keyed by MIME type, with the extension coming from THIS table
 * rather than from the uploaded filename. A name like `nice.jpg.html` or
 * `../../../app/page.tsx` is the classic upload attack; deriving the extension
 * here means the client never gets to choose it.
 */
const ALLOWED = {
  "image/jpeg": { ext: "jpg", kind: MEDIA_KIND.IMAGE },
  "image/png": { ext: "png", kind: MEDIA_KIND.IMAGE },
  "image/webp": { ext: "webp", kind: MEDIA_KIND.IMAGE },
  "image/gif": { ext: "gif", kind: MEDIA_KIND.IMAGE },
  "video/mp4": { ext: "mp4", kind: MEDIA_KIND.VIDEO },
  "video/quicktime": { ext: "mov", kind: MEDIA_KIND.VIDEO },
} as const;

type AllowedType = keyof typeof ALLOWED;

/** A phone photo is a few MB; a short clip is larger. */
const MAX_BYTES = {
  [MEDIA_KIND.IMAGE]: 10 * 1024 * 1024, // 10MB
  [MEDIA_KIND.VIDEO]: 50 * 1024 * 1024, // 50MB
} as const;

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function isAllowed(type: string): type is AllowedType {
  return Object.prototype.hasOwnProperty.call(ALLOWED, type);
}

export interface SavedUpload {
  /** Web path, e.g. `/uploads/1f4c....jpg`. Stored on the item. */
  mediaUrl: string;
  mediaKind: MediaKind;
  bytes: number;
}

/**
 * Validates and writes one uploaded file.
 *
 * Throws ApiError on anything the school should not be storing, so a route can
 * call it on a straight line.
 */
export async function saveUpload(file: File): Promise<SavedUpload> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new ApiError(400, "Attach a photo or a video.", {
      file: "Attach a photo or a video.",
    });
  }
  if (file.size === 0) {
    throw new ApiError(400, "That file is empty.", { file: "That file is empty." });
  }

  const type = file.type.toLowerCase();
  if (!isAllowed(type)) {
    throw new ApiError(
      400,
      "That file type is not supported. Use a JPEG, PNG, WebP, GIF or MP4.",
      { file: "Unsupported file type." },
    );
  }

  const { ext, kind } = ALLOWED[type];

  const limit = MAX_BYTES[kind];
  if (file.size > limit) {
    const mb = Math.round(limit / (1024 * 1024));
    throw new ApiError(400, `That file is too large. The limit is ${mb}MB.`, {
      file: `Keep it under ${mb}MB.`,
    });
  }

  // Random name, extension from the allowlist above. The uploaded filename is
  // never used to build a path.
  const name = `${randomUUID()}.${ext}`;
  const destination = path.join(UPLOAD_DIR, name);

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  return { mediaUrl: `/uploads/${name}`, mediaKind: kind, bytes: file.size };
}

/**
 * Best-effort cleanup for a file whose database write then failed.
 *
 * Swallows its errors: the caller is already reporting a failure, and an
 * orphaned file is a tidiness problem, not something to mask that with.
 */
export async function discardUpload(mediaUrl: string): Promise<void> {
  if (!mediaUrl.startsWith("/uploads/")) return;
  const name = path.basename(mediaUrl);
  try {
    await unlink(path.join(UPLOAD_DIR, name));
  } catch {
    // Already gone, or never written.
  }
}
