import { z } from "zod";

import { connectDB } from "@/lib/db";
import { fail, handle, ok, parseBody } from "@/lib/api";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { User } from "@/models";
import { USER_STATUS } from "@/models/enums";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  return handle(async () => {
    const { email, password, rememberMe } = await parseBody(
      request,
      LoginSchema,
    );

    await connectDB();
    // `password` is `select: false` on the schema, so it has to be asked for.
    const user = await User.findOne({ email }).select("+password");

    // One message and one code for "no such user" and "wrong password" alike.
    // Distinguishing them turns this route into an oracle for which email
    // addresses hold accounts.
    const passwordMatches = await verifyPassword(password, user?.password);
    if (!user || !passwordMatches) {
      return fail(401, "Email or password is incorrect.");
    }

    if (user.status === USER_STATUS.SUSPENDED) {
      return fail(403, "This account has been suspended.");
    }
    /*
     * Nothing in the app creates INVITED accounts any more, but the schema
     * still defaults to it, so a hand-inserted document can land here. The
     * message no longer promises an invitation email that nobody sends.
     */
    if (user.status === USER_STATUS.INVITED) {
      return fail(
        403,
        "This account is not active yet. Ask an administrator to activate it.",
      );
    }

    const session = await createSession(
      { userId: String(user._id), role: user.role },
      rememberMe,
    );

    /*
     * The token goes in the body only when the caller asks for it.
     *
     * A native app has no cookie jar, so it needs the JWT itself. The browser
     * dashboard does not - it already has the httpOnly cookie, and handing the
     * same token to page JavaScript would put it within reach of an XSS for no
     * benefit. So mobile clients opt in with `X-Auth-Mode: token`, and the web
     * app, which never sends that header, is unchanged.
     */
    const wantsToken =
      request.headers.get("x-auth-mode")?.toLowerCase() === "token";

    // Best-effort: a failed bookkeeping write must not fail the sign-in.
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } })
      .exec()
      .catch((error: unknown) => {
        console.error("Could not record lastLoginAt:", error);
      });

    return ok({
      user: {
        id: String(user._id),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl ?? null,
        // The sign-in form sends them straight to /change-password on true.
        mustChangePassword: user.mustChangePassword,
      },
      // Present only for `X-Auth-Mode: token` callers. `expiresIn` is seconds
      // from now, so the app can refresh before a request fails rather than
      // after - and it is the same lifetime as the cookie, not a second one.
      ...(wantsToken
        ? { token: session.token, expiresIn: session.expiresIn }
        : {}),
    });
  });
}
