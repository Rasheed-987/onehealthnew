import type { ServerEvent } from "@/lib/realtime/events";
import { USER_ROLE, type UserRole } from "@/models/enums";

/**
 * The register of live connections, and the one way to push to them.
 *
 * Parked on `globalThis` for the same reason the Mongoose connection is, plus
 * a sharper one. `server.ts` runs through tsx and is never bundled; the route
 * handlers are bundled by Next. Two module graphs, so a plain module-level
 * `Set` here would be *two* Sets - the server would fill one and the routes
 * would publish into the other, and nothing would ever arrive. The global is
 * what makes them the same object.
 *
 * Scope: one process. A second instance behind a load balancer would have its
 * own register and would not see this one's traffic - at which point this
 * needs a Redis or Mongo change-stream adapter behind the same `publish`
 * signature. Nothing above this module would have to change for that.
 */

export interface Connection {
  userId: string;
  role: UserRole;
  send: (payload: string) => void;
}

interface RealtimeHub {
  connections: Set<Connection>;
}

declare global {
  var _realtimeHub: RealtimeHub | undefined;
}

const hub: RealtimeHub = (globalThis._realtimeHub ??= {
  connections: new Set(),
});

/** Registers a socket. Returns the function that unregisters it. */
export function addConnection(connection: Connection): () => void {
  hub.connections.add(connection);
  return () => {
    hub.connections.delete(connection);
  };
}

/**
 * Pushes an event to a set of users, across every tab each of them has open.
 *
 * The sender is not excluded. They may well be reading the same conversation in
 * another window, and the client dedupes by message id anyway - so echoing is
 * both harmless and the only way a second tab stays correct.
 *
 * Super admins are included on message traffic because their inbox is every
 * thread; that is the same reach `resolveThreadScope` already grants them, not
 * a new one. Read receipts are *not* broadcast to them - see `publishRead`.
 */
export function publish(userIds: Iterable<string>, event: ServerEvent): void {
  deliver(new Set([...userIds].map(String)), event, true);
}

/**
 * Read receipts, to participants only.
 *
 * An administrator opening a thread to check on it is not the family reading
 * it, and must not show up on the teacher's screen as "Seen". `markThreadRead`
 * still records their position - their own unread badge depends on it - it
 * simply is not anybody else's business.
 */
export function publishRead(
  userIds: Iterable<string>,
  event: ServerEvent,
): void {
  deliver(new Set([...userIds].map(String)), event, false);
}

function deliver(
  targets: Set<string>,
  event: ServerEvent,
  includeAdmins: boolean,
): void {
  if (hub.connections.size === 0) return;

  const payload = JSON.stringify(event);
  for (const connection of hub.connections) {
    const wanted =
      targets.has(connection.userId) ||
      (includeAdmins && connection.role === USER_ROLE.SUPER_ADMIN);
    if (!wanted) continue;
    try {
      connection.send(payload);
    } catch {
      // A socket that died between the iteration and the write. Its own close
      // handler will unregister it; dropping this one frame is the right
      // outcome and must not take down the rest of the fan-out.
    }
  }
}

/** Diagnostics only. */
export function connectionCount(): number {
  return hub.connections.size;
}
