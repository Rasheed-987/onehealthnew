import { z } from "zod";

import { connectDB } from "@/lib/db";
import { handle, ok, parseBody } from "@/lib/api";
import { sendPasswordResetEmail } from "@/lib/emails";
import { hasRecentToken, issueOtpToken } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_STATUS } from "@/models/enums";

const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export async function POST(request: Request) {
  return handle(async () => {
    const { email } = await parseBody(request, ForgotPasswordSchema);
    await connectDB();

    const user = await User.findOne({ email });

    /*
     * Only ACTIVE accounts get an OTP. A SUSPENDED user must not be able
     * to let themselves back in, and an INVITED one has no password to reset -
     * they need their invitation resending instead.
     */
    if (user && user.status === USER_STATUS.ACTIVE) {
      try {
        // Enforce 60-second cooldown to prevent spamming OTP requests
        const isRecent = await hasRecentToken(
          user._id,
          TOKEN_TYPE.PASSWORD_RESET,
          60 * 1000,
        );

        if (!isRecent) {
          const { otp } = await issueOtpToken(
            user._id,
            TOKEN_TYPE.PASSWORD_RESET,
          );
          await sendPasswordResetEmail({
            to: user.email,
            firstName: user.firstName,
            otp,
          });
        }
      } catch (error) {
        // Logged, never surfaced: a delivery error that reached the client
        // would confirm the address exists.
        console.error("Password reset OTP email failed:", error);
      }
    }

    /*
     * Always the same answer, whatever happened above.
     */
    return ok({
      message:
        "If that email address has an account, a verification code is on its way.",
    });
  });
}
