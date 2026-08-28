import { z } from "zod";

import { connectDB } from "@/lib/db";
import { handle, ok, parseBody } from "@/lib/api";
import {
  sendActivationCodeEmail,
  sendPasswordResetEmail,
} from "@/lib/emails";
import { claimCodeRequest, hasRecentToken, issueOtpToken } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_ROLE, USER_STATUS } from "@/models/enums";

/**
 * "Sign in with code" - the one button the app shows, for both halves of a
 * guardian's life.
 *
 * Which code goes out depends on the account, and the caller is never told
 * which:
 *
 *   INVITED + PARENT  an ACTIVATION code; they have no password yet
 *   ACTIVE            a PASSWORD_RESET code; they have one and have lost it
 *   anything else     nothing at all
 *
 * One endpoint rather than two so the app needs no way of asking "has this
 * person set up yet?" - a question it could only answer by leaking whether an
 * address holds an account. It also means an ACTIVE guardian tapping this by
 * mistake lands in a password reset rather than a dead end, and crucially that
 * they still end up typing a password: this is not a passwordless sign-in, it
 * is the way a password gets set.
 *
 * The INVITED-but-staff case deliberately sends nothing. Staff activate through
 * the emailed link, and issuing them a code here would be a second, quieter
 * route into an account that is meant to have one.
 */
const RequestCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export async function POST(request: Request) {
  return handle(async () => {
    const { email } = await parseBody(request, RequestCodeSchema);
    await connectDB();

    const user = await User.findOne({ email });

    const wantsActivation =
      user?.status === USER_STATUS.INVITED && user.role === USER_ROLE.PARENT;
    const wantsReset = user?.status === USER_STATUS.ACTIVE;

    if (user && (wantsActivation || wantsReset)) {
      const type = wantsActivation
        ? TOKEN_TYPE.ACTIVATION
        : TOKEN_TYPE.PASSWORD_RESET;

      try {
        /*
         * Two limits, and both are needed.
         *
         * The 60-second cooldown stops a resend loop. The daily allowance is
         * what actually bounds guessing: `issueOtpToken` resets `attempts` on
         * every issue, so MAX_OTP_ATTEMPTS is five guesses per code rather than
         * five in total, and without a cap on codes an attacker just asks for
         * another one. Checked before issuing, so a blocked request leaves the
         * live code alone instead of replacing it with one nobody receives.
         */
        const isRecent = await hasRecentToken(user._id, type, 60 * 1000);

        if (!isRecent && (await claimCodeRequest(user._id))) {
          const { otp } = await issueOtpToken(user._id, type);

          if (wantsActivation) {
            await sendActivationCodeEmail({
              to: user.email,
              firstName: user.firstName,
              otp,
            });
          } else {
            await sendPasswordResetEmail({
              to: user.email,
              firstName: user.firstName,
              otp,
            });
          }
        }
      } catch (error) {
        // Logged, never surfaced: a delivery error that reached the client
        // would confirm the address exists.
        console.error("Sign-in code email failed:", error);
      }
    }

    /*
     * Always the same answer, whatever happened above - unknown address,
     * suspended account, staff account, spent allowance, dead mail server.
     */
    return ok({
      message:
        "If that email address has an account, a verification code is on its way.",
    });
  });
}
