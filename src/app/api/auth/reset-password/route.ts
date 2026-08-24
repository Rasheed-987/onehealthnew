import { z } from "zod";

import { connectDB } from "@/lib/db";
import { fail, handle, ok, parseBody } from "@/lib/api";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { destroySession } from "@/lib/session";
import { consumeToken, revokeTokens } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";

const ResetPasswordSchema = z
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
  "not-found": "This reset link is not valid.",
  expired: "This reset link has expired. Request a new one.",
  used: "This reset link has already been used.",
} as const;

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseBody(request, ResetPasswordSchema);
    await connectDB();

    const result = await consumeToken(input.token, TOKEN_TYPE.PASSWORD_RESET);
    if (!result.ok) return fail(400, DEAD_LINK[result.reason]);

    const user = await User.findById(result.userId);
    if (!user) return fail(400, "This reset link is no longer valid.");

    user.password = await hashPassword(input.password);
    user.mustChangePassword = false;
    await user.save();

    // Same reasoning as accept-invite: drop the other kind, keep the spent
    // token so a repeat click can still be told it was already used.
    await revokeTokens(user._id, TOKEN_TYPE.INVITE);

    /*
     * Deliberately NOT signed in afterwards, unlike accepting an invitation.
     *
     * A reset is what someone does when they suspect their account is
     * compromised, so this clears whatever session the browser is holding and
     * makes them prove the new password at the sign-in screen.
     */
    await destroySession();

    return ok({ success: true });
  });
}
