import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { USER_ROLE, type UserRole } from "@/models/enums";

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

export const SESSION_COOKIE = "lan_session";

/** "Remember me" ticked, versus a session that should expire the same day. */
const REMEMBER_ME_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_MAX_AGE = 60 * 60 * 8; // 8 hours - one school day

export interface SessionPayload {
  userId: string;
  role: UserRole;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload,
  maxAgeSeconds: number,
): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getSecret());
}

/**
 * Returns null rather than throwing on anything wrong with the token - expired,
 * tampered with, signed by an old secret. Callers treat "no session" and "bad
 * session" identically, and a malformed cookie must never 500 the app.
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    const userId = payload.sub;
    const role = payload.role;
    if (typeof userId !== "string") return null;
    if (!isUserRole(role)) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (Object.values(USER_ROLE) as string[]).includes(value)
  );
}

/** Reads the session off the incoming request. Server components and handlers. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function createSession(
  payload: SessionPayload,
  rememberMe: boolean,
): Promise<void> {
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
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
