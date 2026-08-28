import type { NextRequest } from "next/server";

import { ApiError, handle, ok, parseBody, requirePermission } from "@/lib/api";
import {
  SendMessageSchema,
  appendMessage,
  hydrateMessageRows,
  hydrateThreadRows,
  markThreadRead,
  threadParticipants,
  toWireMessage,
} from "@/lib/messages";
import { assertCanPost, findThreadInScope } from "@/lib/messageScope";
import { publish, publishRead } from "@/lib/realtime/hub";
import { Message, MessageThread } from "@/models";

/**
 * One conversation: reading it, and adding to it.
 *
 * The GET serves three different asks off the same `{ thread, createdAt }`
 * index - the transcript when the thread is opened, `?after=` for the poll that
 * keeps it live, and `?before=` for scrolling back through older messages.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** A query timestamp, or a 400 naming the parameter that was wrong. */
function timestamp(value: string | null, name: string): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ApiError(400, `\`${name}\` must be a date.`);
  }
  return new Date(parsed);
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/messages/threads/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("message:list");
    const { id } = await context.params;
    const thread = await findThreadInScope(session, id);

    const params = request.nextUrl.searchParams;
    const after = timestamp(params.get("after"), "after");
    const before = timestamp(params.get("before"), "before");
    const limit = Math.min(
      Math.max(Number(params.get("limit")) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const filter: Record<string, unknown> = { thread: thread._id };
    let messages;

    if (after) {
      // The poll. Everything new, oldest first, so it appends in order.
      filter.createdAt = { $gt: after };
      messages = await Message.find(filter).sort({ createdAt: 1 }).limit(limit);
    } else {
      // The opening read, and scroll-back. Both want the newest `limit`
      // messages of their window, so they are fetched descending and flipped.
      if (before) filter.createdAt = { $lt: before };
      messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit);
      messages.reverse();
    }

    /*
     * Opening a conversation is reading it. `markThreadRead` no-ops when this
     * reader was already up to date - and returns null when it does, which is
     * what keeps a re-opened thread from emitting a redundant receipt.
     */
    const readAt = await markThreadRead(thread, session.userId);

    // Re-read so `unreadCount` reflects the mark above rather than the state
    // this request arrived in.
    const fresh = (await MessageThread.findById(thread._id)) ?? thread;
    const [row] = await hydrateThreadRows([fresh], session.userId);

    /*
     * Tell the other side, so their "Sent" becomes "Seen" without either of
     * them asking again. Participants only - an administrator reading a
     * family's thread is not a read receipt anyone is owed.
     */
    if (readAt) {
      const participants = await threadParticipants(fresh);
      const me = participants.find((p) => p.id === String(session.userId));
      if (me) {
        publishRead(
          participants.filter((p) => p.id !== me.id).map((p) => p.id),
          {
            type: "thread:read",
            threadId: String(fresh._id),
            reader: { id: me.id, label: me.label },
            at: readAt.toISOString(),
          },
        );
      }
    }

    return ok({
      thread: row,
      messages: await hydrateMessageRows(messages, fresh, session.userId),
      /** False once a page comes back short - there is nothing older left. */
      hasMore: before ? messages.length === limit : undefined,
    });
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/messages/threads/[id]">,
) {
  return handle(async () => {
    const session = await requirePermission("message:send");
    const { id } = await context.params;
    const thread = await findThreadInScope(session, id);
    // Reading a thread and adding to it are different questions: the super
    // admin passes the first and is refused here.
    await assertCanPost(session, thread);

    const input = await parseBody(request, SendMessageSchema);
    const message = await appendMessage(thread, session, input.body);
    const [row] = await hydrateMessageRows([message], thread, session.userId);

    // The sender is included: they may have this same conversation open in
    // another tab, and the client dedupes by id.
    const participants = await threadParticipants(thread);
    publish(participants.map((p) => p.id), {
      type: "message:new",
      threadId: String(thread._id),
      message: toWireMessage(row),
    });

    return ok({ message: row }, 201);
  });
}
