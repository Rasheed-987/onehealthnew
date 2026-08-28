import { SignJWT, jwtVerify } from "jose";

import { USER_ROLE, type UserRole } from "@/models/enums";

/**
 * Signing and verifying the session JWT, and nothing else.
 *
 * Split out of `session.ts` because that module reads the request through
 * `next/headers`, which only exists inside a Next request. The WebSocket
 * handshake is authenticated in the custom server, outside any such context -
 * it has a raw `Cookie:` header and needs exactly this much of the session
 * machinery, with none of the Next coupling.
 *
 * `session.ts` re-exports all of this, so nothing that already imports from
 * there had to change.
 */

export const SESSION_COOKIE = "lan_session";

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

/**
 * The token out of a raw upgrade request, in the order the clients present it.
 *
 * The WebSocket handshake is a plain HTTP request with no Next parsing in front
 * of it, so all three envelopes have to be opened by hand here - and there are
 * three because the two kinds of client cannot use the same one:
 *
 * - **Cookie** - the browser dashboard. It has an httpOnly cookie and the
 *   browser attaches it to the upgrade automatically.
 * - **Authorization: Bearer** - a native app. It holds the JWT itself (see the
 *   note on `bearerToken` in `session.ts`) and React Native's WebSocket lets
 *   headers be set on the handshake. This is the one to prefer.
 * - **`?token=` query parameter** - the last resort, for clients whose socket
 *   API cannot set a header at all. It works, but a URL is the one part of a
 *   request that reliably ends up in access logs and crash reports, so it is
 *   offered rather than recommended.
 *
 * Same signature and same expiry whichever way it arrives: this is one session
 * format in three envelopes, not three kinds of session.
 */
export function tokenFromUpgrade(req: {
  headers: { cookie?: string; authorization?: string };
  url?: string;
}): string | undefined {
  const fromCookie = sessionCookieFromHeader(req.headers.cookie);
  if (fromCookie) return fromCookie;

  const fromHeader = bearerFromHeader(req.headers.authorization);
  if (fromHeader) return fromHeader;

  try {
    // The base is a throwaway - only the query string is wanted.
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

/** `Authorization: Bearer <jwt>`. Case-insensitive scheme, as RFC 7235 says. */
export function bearerFromHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return undefined;
  return token || undefined;
}

/**
 * The session cookie out of a raw `Cookie:` header.
 */
export function sessionCookieFromHeader(
  header: string | undefined,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}
