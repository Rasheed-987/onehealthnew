import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

/**
 * Optimistic auth routing. In Next.js 16 this file is `proxy.ts` - the
 * `middleware.ts` convention is deprecated and renamed.
 *
 * This ONLY looks at whether a session cookie is present; it does not verify
 * the signature and it does not read the database. The Next docs are explicit
 * that proxy is not a session-management or authorisation layer, and running
 * crypto plus a Mongo lookup on every asset request would be the wrong place
 * for it anyway.
 *
 * The real checks live where the data does: `getSession()` in server
 * components and `requireSession()` / `requirePermission()` in route handlers.
 * A forged cookie gets past this file and is then rejected there.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const isSignIn = pathname === "/sign-in";
  /*
   * Reachable without a session: the recipient of an invitation or a reset
   * email has no cookie yet, and bouncing them to /sign-in would make every
   * emailed link dead on arrival.
   */
  const isPublic =
    isSignIn ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/accept-invite/") ||
    pathname.startsWith("/reset-password/");

  if (!hasCookie && !isPublic) {
    const url = new URL("/sign-in", request.url);
    // Send them back where they were going once they are through.
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  /*
   * Only /sign-in bounces a signed-in visitor away. Someone holding a session
   * may still be redeeming a link - an admin setting up a second account, or a
   * user resetting a password they have forgotten mid-session.
   */
  if (hasCookie && isSignIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Everything except Next's own assets, the auth endpoints (which must stay
   * reachable while signed out) and public files. `/api/auth/login` in
   * particular would be unreachable if the redirect above applied to it.
   */
  matcher: [
    "/((?!_next/static|_next/image|api/auth|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
