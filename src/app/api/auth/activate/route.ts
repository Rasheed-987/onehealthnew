import { z } from "zod";

import { connectDB } from "@/lib/db";
import { fail, handle, ok, parseBody } from "@/lib/api";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { revokeTokens, verifyAndConsumeOtp } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_ROLE, USER_STATUS } from "@/models/enums";

/**
 * Redeems an activation code: the guardian chooses their password and the
 * account becomes usable.
 *
 * The app-side twin of `accept-invite`, which does the same job for staff from
 * a link in a browser. Public by necessity - the whole point is that the caller
 * has no session yet - and the code is the only credential, which is why it is
 * short-lived, single-use, attempt-limited and stored hashed.
 *
 * Guardians only. A member of staff holding a live invitation link must not be
 * able to bypass it here, and an ACTIVE account has a password already: both
 * are turned away with the same wording as a bad code, so this route cannot be
 * used to find out which accounts exist or what state they are in.
 */
const ActivateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    otp: z.string().trim().length(6, "Verification code must be 6 digits."),
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      ),
    confirmPassword: z.string().min(1, "Repeat the password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

/** Says nothing about which of the three things was wrong. */
const NO_MATCH = "Invalid verification code or code has expired.";

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseBody(request, ActivateSchema);
    await connectDB();

    const user = await User.findOne({ email: input.email });
    if (
      !user ||
      user.status !== USER_STATUS.INVITED ||
      user.role !== USER_ROLE.PARENT
    ) {
      return fail(400, NO_MATCH);
    }

    const result = await verifyAndConsumeOtp(
      user._id,
      input.otp,
      TOKEN_TYPE.ACTIVATION,
    );

    if (!result.ok) {
      if (result.reason === "invalid-otp") {
        const remaining = result.remainingAttempts ?? 0;
        return fail(
          400,
          `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : "Please request a new code."}`,
        );
      }
      if (result.reason === "too-many-attempts") {
        return fail(
          400,
          "Too many failed attempts. Verification code locked. Please request a new code.",
        );
      }
      if (result.reason === "expired") {
        return fail(
          400,
          "This verification code has expired. Request a new one.",
        );
      }
      return fail(400, NO_MATCH);
    }

    user.password = await hashPassword(input.password);
    user.status = USER_STATUS.ACTIVE;
    // They chose this one themselves, so nothing is forcing a change.
    user.mustChangePassword = false;
    await user.save();

    // Nothing outstanding survives a password being set - an unspent reset code
    // would otherwise still be good against the account they just secured.
    await revokeTokens(user._id);

    /*
     * Signed straight in: they have just proved control of the mailbox and
     * chosen a password, so making them type it again on a sign-in screen adds
     * nothing.
     */
    const session = await createSession(
      { userId: String(user._id), role: user.role },
      true,
    );

    /*
     * The token goes in the body only when the caller asks for it, exactly as
     * on `login`. The app has no cookie jar and needs the JWT itself; a browser
     * already has the httpOnly cookie, and handing the same token to page
     * JavaScript would put it in reach of an XSS for no benefit.
     */
    const wantsToken =
      request.headers.get("x-auth-mode")?.toLowerCase() === "token";

    return ok({
      user: {
        id: String(user._id),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl ?? null,
      },
      ...(wantsToken
        ? { token: session.token, expiresIn: session.expiresIn }
        : {}),
    });
  });
}
