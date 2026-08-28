import type { MessageRow } from "@/lib/messages";

/**
 * What travels over the socket.
 *
 * Deliberately thin. The socket says *what changed*, not what to draw - the
 * REST routes remain the only thing that renders a row, and the client patches
 * the cache it already had. Two reasons that matters here: a message row's
 * `mine` flag is answered differently for each reader, so one broadcast payload
 * could not carry it; and a socket that only nudges can be lost entirely
 * without the screen going wrong, which is what makes falling back to polling
 * a real fallback rather than a second code path.
 *
 * Imported by both the browser and the custom server, so it carries types
 * only - no Mongoose, no `ws`.
 */

/** A message as it goes on the wire: everything but the per-reader `mine`. */
export type WireMessage = Omit<MessageRow, "mine">;

/**
 * Sent once, on connect. Carries the reader's own id so the client can work
 * out `mine` for itself - see the note above.
 */
export interface ReadyEvent {
  type: "ready";
  userId: string;
}

/** Someone wrote into a thread this connection is a participant of. */
export interface MessageNewEvent {
  type: "message:new";
  threadId: string;
  message: WireMessage;
}

/**
 * Someone else read up to `at`. This is what turns "Sent" into "Seen" on the
 * other side without either party polling for it.
 */
export interface ThreadReadEvent {
  type: "thread:read";
  threadId: string;
  reader: { id: string; label: string };
  at: string;
}

export type ServerEvent = ReadyEvent | MessageNewEvent | ThreadReadEvent;

/**
 * The client speaks only to prove it is alive. Everything it wants to *do* -
 * sending, marking read - still goes through the REST routes, which already
 * hold the authorisation rules. Letting the socket write would mean a second
 * place those rules have to be enforced.
 */
export interface PingCommand {
  type: "ping";
}

export type ClientCommand = PingCommand;

/** The path the custom server listens for upgrades on. */
export const REALTIME_PATH = "/ws";

/**
 * How often the client pings. Comfortably inside the 60s idle timeout most
 * reverse proxies apply to an idle upgrade, so a quiet conversation does not
 * get its socket closed underneath it.
 */
export const HEARTBEAT_MS = 25_000;
