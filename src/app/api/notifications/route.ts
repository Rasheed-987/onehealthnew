import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  CreateNotificationSchema,
  hydrateNotificationRows,
} from "@/lib/notifications";
import {
  resolveAudience,
  resolveNotificationScope,
} from "@/lib/notificationScope";
import { escapeRegex } from "@/lib/teachers";
import { Notification } from "@/models";
import { NOTIFICATION_AUDIENCE, USER_ROLE } from "@/models/enums";

/**
 * School announcements: the board everyone reads, and writing to it.
 *
 * Neither handler branches on role. `resolveNotificationScope` turns the
 * session into a filter once - everything for the super admin who wrote them,
 * and for everybody else the notices whose audience actually reaches them -
 * and `notification:create` is what keeps every other role out of the write
 * path entirely.
 */

const ListQuerySchema = z.object({
  /** Narrows the admin table to one category of audience. */
  kind: z.enum(NOTIFICATION_AUDIENCE).optional(),
  search: z.string().trim().optional(),
  /** Author-only: shows withdrawn notices alongside live ones. */
  includeInactive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Matches the "Show N entries" selector, which tops out at 100.
  perPage: z.coerce.number().int().min(1).max(100).default(10),
});

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("notification:list");
    const { kind, search, includeInactive, page, perPage } =
      ListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

    // Scope first, so everything below narrows it and nothing replaces it.
    const filter: Record<string, unknown> = await resolveNotificationScope(
      session,
    );

    if (kind) filter["audience.kind"] = kind;

    /*
     * Withdrawn notices are the author's business alone. The scope has already
     * pinned `isActive: true` for every other role, so the flag is checked
     * against the role rather than trusted to key order - a reader who sent
     * `includeInactive=true` must not be able to unpin it.
     */
    if (session.role === USER_ROLE.SUPER_ADMIN && !includeInactive) {
      filter.isActive = true;
    }

    if (search) {
      // `$and`, because the scope above may already own the top-level `$or`.
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$and = [{ $or: [{ body: pattern }, { title: pattern }] }];
    }

    const [rows, total] = await Promise.all([
      Notification.find(filter)
        // `_id` breaks ties, so two notices posted in the same second cannot
        // swap places between pages and hide one of themselves.
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      Notification.countDocuments(filter),
    ]);

    return ok({
      notifications: await hydrateNotificationRows(rows),
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
 * Posting a notice.
 *
 * POST rather than PUT, and no natural key: "the nursery closes at noon" sent
 * twice is two announcements, not one written twice, and a retried PUT on this
 * collection would quietly become the second of them.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("notification:create");
    const input = await parseBody(request, CreateNotificationSchema);

    // The audience is checked before anything is written, so a notice never
    // exists addressed to a room that was closed while the form was open.
    const audience = await resolveAudience(input.audience);

    /*
     * `create` rather than an upsert, so the model's `pre("validate")` hook
     * runs - it is what enforces one kind, one list, and nothing left over.
     */
    const notification = await Notification.create({
      title: input.title,
      body: input.body,
      audience,
      // Off the session, never the body: a notice cannot be filed under
      // somebody else's name.
      createdBy: session.userId,
    });

    const [row] = await hydrateNotificationRows([notification]);
    return ok({ notification: row }, 201);
  });
}
