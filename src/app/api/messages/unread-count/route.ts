import { handle, ok, requirePermission } from "@/lib/api";
import { unreadByThread } from "@/lib/messages";
import { resolveThreadScope } from "@/lib/messageScope";
import { MessageThread } from "@/models";

/**
 * The number on the sidebar.
 *
 * Its own route rather than a field on the inbox, because the badge is polled
 * from every page in the dashboard while the inbox is only ever polled from
 * one. Two `$in`-served queries: the caller's threads, then one aggregation
 * over the ones that could possibly hold something new.
 */

export async function GET() {
  return handle(async () => {
    const session = await requirePermission("message:list");
    const { filter } = await resolveThreadScope(session);

    /*
     * Only the fields the count needs. The badge does not care who anyone is,
     * so there is no reason to pull names or previews across for it.
     */
    const threads = await MessageThread.find(filter).select(
      "_id readState lastMessageAt",
    );

    const unread = await unreadByThread(threads, session.userId);
    let count = 0;
    for (const n of unread.values()) count += n;

    return ok({ count });
  });
}
