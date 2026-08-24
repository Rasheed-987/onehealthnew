import { z } from "zod";

import { ApiError, fail, handle, ok, parseBody, requireSession } from "@/lib/api";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import { createSession } from "@/lib/session";
import { User } from "@/models";

/**
 * Lets the signed-in user replace their own password.
 *
 * This is the other half of handing a password over by hand: the admin picks
 * the first one, the owner replaces it here, and `mustChangePassword` stops
 * being set - so the admin no longer holds working credentials for someone
 * else's account.
 */
const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      ),
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "The new password must be different from the current one.",
  });

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireSession();
    const input = await parseBody(request, ChangePasswordSchema);

    const user = await User.findById(session.userId).select("+password");
    if (!user) throw new ApiError(401, "You must be signed in.");

    // Re-checking the current password matters even though they are already
    // signed in: it stops an unattended session from being used to lock the
    // real owner out of their account.
    const matches = await verifyPassword(input.currentPassword, user.password);
    if (!matches) {
      return fail(400, "Your current password is incorrect.", {
        currentPassword: "This is not your current password.",
      });
    }

    user.password = await hashPassword(input.newPassword);
    user.mustChangePassword = false;
    await user.save();

    // Issue a fresh cookie so the session outlives the change rather than
    // expiring on whatever was left of the old one.
    await createSession({ userId: String(user._id), role: user.role }, false);

    return ok({ success: true });
  });
}
