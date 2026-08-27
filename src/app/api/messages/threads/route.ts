import mongoose from "mongoose";
import type { NextRequest } from "next/server";

import { handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  StartThreadSchema,
  appendMessage,
  hydrateMessageRows,
  hydrateThreadRows,
} from "@/lib/messages";
import { resolvePair, resolveThreadScope } from "@/lib/messageScope";
import { MessageThread } from "@/models";

/**
 * The inbox, and starting a conversation.
 *
 * Neither handler branches on role. `resolveThreadScope` turns the session into
 * a filter once - every thread for a super admin, their own for a teacher, and
 * for a guardian the threads about their own children.
 */

const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("message:list");
    const { filter } = await resolveThreadScope(session);

    const limit = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("limit")) || 50, 1),
      MAX_LIMIT,
    );

    const threads = await MessageThread.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(limit);

    return ok({
      scope: { role: session.role },
      threads: await hydrateThreadRows(threads, session.userId),
    });
  });
}

/**
 * Start a conversation, or return the one that already exists.
 *
 * Idempotent on `{ student, teacher }`, which is the whole reason that pair is
 * a unique index. "Message Sara's teacher" is a button two guardians can press
 * on the same afternoon, and it has to land both of them in the same
 * conversation rather than forking one nobody is watching.
 *
 * An optional `body` sends the first message in the same call, so opening a
 * conversation is one round trip rather than two.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const session = await requirePermission("message:send");
    const input = await parseBody(request, StartThreadSchema);
    const { student, teacherId, classroom } = await resolvePair(session, input);

    const key = { student: student._id, teacher: teacherId };
    let thread = await MessageThread.findOne(key);
    const created = thread === null;

    if (!thread) {
      try {
        thread = await MessageThread.create({
          ...key,
          classroom: classroom._id,
          lastMessageAt: new Date(),
          lastMessagePreview: "",
          lastMessageBy: null,
          readState: [],
          createdBy: session.userId,
        });
      } catch (error) {
        /*
         * Lost the race to a concurrent request. `handle` would turn E11000
         * into "That student is already taken.", which is both wrong and
         * alarming - the correct answer is the thread the other request just
         * made.
         */
        if (
          error instanceof mongoose.mongo.MongoServerError &&
          error.code === 11000
        ) {
          thread = await MessageThread.findOne(key);
        }
        if (!thread) throw error;
      }
    }

    const message = input.body
      ? await appendMessage(thread, session, input.body)
      : null;

    // Re-read so the row carries the message just written, rather than the
    // pre-send state of the document we happen to be holding.
    const fresh = (await MessageThread.findById(thread._id)) ?? thread;
    const [row] = await hydrateThreadRows([fresh], session.userId);

    return ok(
      {
        thread: row,
        message: message
          ? (await hydrateMessageRows([message], fresh, session.userId))[0]
          : null,
      },
      created ? 201 : 200,
    );
  });
}
