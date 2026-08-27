import { z } from "zod";

import { connectDB } from "@/lib/db";
import { fail, handle, ok, parseBody } from "@/lib/api";
import { MIN_PASSWORD_LENGTH, hashPassword } from "@/lib/password";
import { destroySession } from "@/lib/session";
import { revokeTokens, verifyAndConsumeOtp } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_STATUS } from "@/models/enums";

const ResetPasswordSchema = z
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

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseBody(request, ResetPasswordSchema);
    await connectDB();

    const user = await User.findOne({ email: input.email });
    if (!user || user.status !== USER_STATUS.ACTIVE) {
      return fail(400, "Invalid verification code or code has expired.");
    }

    const result = await verifyAndConsumeOtp(
      user._id,
      input.otp,
      TOKEN_TYPE.PASSWORD_RESET,
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
        return fail(400, "This verification code has expired. Request a new one.");
      }
      return fail(400, "Invalid verification code or code has expired.");
    }

    user.password = await hashPassword(input.password);
    user.mustChangePassword = false;
    await user.save();

    await revokeTokens(user._id);
    await destroySession();

    return ok({ message: "Password changed successfully." });
  });
}
