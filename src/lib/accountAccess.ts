import { ApiError } from "@/lib/api";
import {
  sendInviteEmail,
  sendParentWelcomeEmail,
  sendPasswordResetEmail,
} from "@/lib/emails";
import { issueOtpToken, issueToken } from "@/lib/tokens";
import { User, type IUser } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_ROLE, USER_STATUS } from "@/models/enums";

/**
 * Getting someone into their account, by email.
 *
 * Teachers and parents differ in their profile documents and in nothing else
 * about access, so this lives in one place rather than being copied per role.
 */

/**
 * Sends whichever mail the account actually needs:
 *
 *   INVITED + PARENT  -> "your account is ready, get the app". NO token.
 *   INVITED + staff   -> an invitation link, because no password exists yet
 *   ACTIVE            -> a password reset, because one exists and was lost
 *   SUSPENDED         -> nothing; reactivate the account first
 *
 * The guardian branch is the odd one, and the absence of a token is the point.
 * Guardians live on the mobile app, where an emailed link opens a browser -
 * and a guardian who has just been created almost certainly has not installed
 * the app yet, so the link would go to an app store and the token would not
 * survive the install. They ask for a code from inside the app instead, which
 * is `POST /api/auth/request-code`. Staff are on desktop, where the link is
 * still the better door, so their flow is untouched.
 *
 * Issuing a token drops any earlier one of the same kind, so clicking twice
 * leaves one live link rather than two.
 */
export async function sendAccessEmail(
  user: Pick<IUser, "_id" | "email" | "firstName" | "status" | "role">,
  invitedBy = "An administrator",
): Promise<{
  kind: "invitation" | "password reset" | "app welcome";
  email: string;
}> {
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ApiError(
      409,
      "This account is suspended. Reactivate it before sending a link.",
    );
  }

  if (user.status !== USER_STATUS.INVITED) {
    const { otp } = await issueOtpToken(user._id, TOKEN_TYPE.PASSWORD_RESET);
    await sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      otp,
    });
    return { kind: "password reset", email: user.email };
  }

  if (user.role === USER_ROLE.PARENT) {
    await sendParentWelcomeEmail({
      to: user.email,
      firstName: user.firstName,
      invitedBy,
    });
    return { kind: "app welcome", email: user.email };
  }

  const { token, expiresAt } = await issueToken(user._id, TOKEN_TYPE.INVITE);
  await sendInviteEmail({
    to: user.email,
    firstName: user.firstName,
    token,
    expiresAt,
    invitedBy,
  });
  return { kind: "invitation", email: user.email };
}

/** "Amal Hassan", for naming the sender in an invitation. */
export async function adminDisplayName(userId: string): Promise<string> {
  const admin = await User.findById(userId);
  return admin ? `${admin.firstName} ${admin.lastName}`.trim() : "An administrator";
}

/**
 * Sends the invitation for a freshly created account.
 *
 * Never throws: the account already exists and committed, so a mail failure is
 * reported to the admin (who can resend) rather than turning a successful
 * creation into an error.
 */
export async function sendInviteAfterCreate(
  user: Pick<IUser, "_id" | "email" | "firstName" | "status" | "role">,
  invitedBy: string,
): Promise<{ invited: boolean; inviteError?: string }> {
  try {
    await sendAccessEmail(user, invitedBy);
    return { invited: true };
  } catch (error) {
    console.error("Invitation email failed:", error);
    return {
      invited: false,
      inviteError:
        error instanceof Error ? error.message : "The invitation email failed.",
    };
  }
}
