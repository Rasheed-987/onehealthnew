import { z } from "zod";

import { connectDB } from "@/lib/db";
import { fail, handle, ok, parseBody } from "@/lib/api";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { consumeToken, revokeTokens } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_STATUS } from "@/models/enums";

/**
 * Redeems an invitation: the recipient chooses their password and the account
 * becomes usable.
 *
 * Public by necessity - the whole point is that the caller has no session yet.
 * The token is the only credential, which is why it is 256 bits, single-use
 * and stored hashed.
 */
const AcceptInviteSchema = z
  .object({
    token: z.string().min(1),
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

const DEAD_LINK = {
  "not-found": "This invitation link is not valid.",
  expired: "This invitation link has expired. Ask for a new one.",
  used: "This invitation link has already been used. Try signing in.",
} as const;

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseBody(request, AcceptInviteSchema);
    await connectDB();

    // Spent before the password is written, so two submissions of the same
    // link cannot both succeed.
    const result = await consumeToken(input.token, TOKEN_TYPE.INVITE);
    if (!result.ok) return fail(400, DEAD_LINK[result.reason]);

    const user = await User.findById(result.userId);
    if (!user) return fail(400, "This invitation is no longer valid.");

    user.password = await hashPassword(input.password);
    user.status = USER_STATUS.ACTIVE;
    // They chose this one themselves, so nothing is forcing a change.
    user.mustChangePassword = false;
    await user.save();

    /*
     * Clear any outstanding reset link, but leave the invitation we just spent
     * in place. Deleting it too would erase the `usedAt` marker, and a second
     * click on the emailed link would then report "not valid" instead of the
     * far more useful "already used - try signing in". Mongo's TTL sweeps it
     * once it expires.
     */
    await revokeTokens(user._id, TOKEN_TYPE.PASSWORD_RESET);

    // Sign them straight in - they have just proved control of the mailbox and
    // set a password; making them retype it at /sign-in adds nothing.
    await createSession({ userId: String(user._id), role: user.role }, false);

    return ok({
      user: {
        id: String(user._id),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  });
}
