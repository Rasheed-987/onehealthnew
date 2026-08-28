import { cookies, headers } from "next/headers";

import {
  SESSION_COOKIE,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/sessionToken";

/*
 * Signing and verifying moved to `sessionToken.ts` so the WebSocket handshake -
 * which runs in the custom server, outside any Next request - can verify a
 * cookie without importing `next/headers`. Re-exported here so every existing
 * importer of this module is unaffected.
 */
export {
  SESSION_COOKIE,
  signSessionToken,
  verifySessionToken,
  sessionCookieFromHeader,
  type SessionPayload,
} from "@/lib/sessionToken";

/**
 * Sessions, as a signed JWT in an httpOnly cookie.
 *
 * The token carries only what every request needs for an authorisation
 * decision - the user id and their role - so the common case costs no database
 * round trip. Anything richer (name, avatar, profile ids) is read from Mongo by
 * the handler that actually needs it, because a stale copy baked into a token
 * that lives for days is worse than a lookup.
 *
 * Nothing secret goes in here: a JWT is signed, not encrypted, and the browser
 * can read the payload.
 */

/** "Remember me" ticked, versus a session that should expire the same day. */
export const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const DEFAULT_MAX_AGE = 60 * 60 * 8; // 8 hours - one school day

/**
 * The same token, presented the way a native app can actually present it.
 *
 * The cookie is httpOnly and `sameSite: lax`, which is right for the browser
 * dashboard and unusable from a React Native / native client - there is no
 * cookie jar to put it in. So the mobile app holds the JWT itself and sends
 * `Authorization: Bearer <token>`.
 *
 * Same secret, same signature, same expiry: this is a second envelope for one
 * session format, not a second kind of session. Nothing downstream can tell
 * which envelope a request arrived in, so no route needs to care.
 */
async function bearerToken(): Promise<string | undefined> {
  const header = (await headers()).get("authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  // Case-insensitive: RFC 7235 says the scheme is, and clients differ.
  if (scheme?.toLowerCase() !== "bearer") return undefined;
  return token || undefined;
}

/**
 * Reads the session off the incoming request. Server components and handlers.
 *
 * Cookie first: the dashboard is the majority of traffic, and a browser that
 * has a cookie never sends the header. A mobile request has no cookie and
 * falls through to the bearer token.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const fromCookie = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return verifySessionToken(await bearerToken());
}

/**
 * Signs a session and sets the browser cookie.
 *
 * Returns the token as well so a mobile sign-in can hand it back in the body
 * without signing a second one - two tokens for one sign-in would mean two
 * independent expiries to reason about. Web callers ignore the return value,
 * and the token stays out of the response body unless a client asks for it.
 */
export async function createSession(
  payload: SessionPayload,
  rememberMe: boolean,
): Promise<{ token: string; expiresIn: number }> {
  const maxAge = rememberMe ? REMEMBER_ME_MAX_AGE : DEFAULT_MAX_AGE;
  const token = await signSessionToken(payload, maxAge);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Off on localhost, where there is no TLS to send it over.
    secure: process.env.NODE_ENV === "production",
    // `lax` still sends the cookie on a top-level navigation back into the
    // dashboard, while keeping it off cross-site POSTs.
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return { token, expiresIn: maxAge };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
