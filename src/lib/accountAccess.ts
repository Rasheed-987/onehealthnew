import { ApiError } from "@/lib/api";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/emails";
import { issueToken } from "@/lib/tokens";
import { User, type IUser } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";
import { USER_STATUS } from "@/models/enums";

/**
 * Getting someone into their account, by email.
 *
 * Teachers and parents differ in their profile documents and in nothing else
 * about access, so this lives in one place rather than being copied per role.
 */

/**
 * Sends whichever link the account actually needs:
 *
 *   INVITED   -> an invitation, because no password has ever been chosen
 *   ACTIVE    -> a password reset, because one exists and has been lost
 *   SUSPENDED -> nothing; reactivate the account first
 *
 * Issuing a token drops any earlier one of the same kind, so clicking twice
 * leaves one live link rather than two.
 */
export async function sendAccessEmail(
  user: Pick<IUser, "_id" | "email" | "firstName" | "status">,
  invitedBy = "An administrator",
): Promise<{ kind: "invitation" | "password reset"; email: string }> {
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ApiError(
      409,
      "This account is suspended. Reactivate it before sending a link.",
    );
  }

  const invite = user.status === USER_STATUS.INVITED;
  const { token, expiresAt } = await issueToken(
    user._id,
    invite ? TOKEN_TYPE.INVITE : TOKEN_TYPE.PASSWORD_RESET,
  );

  if (invite) {
    await sendInviteEmail({
      to: user.email,
      firstName: user.firstName,
      token,
      expiresAt,
      invitedBy,
    });
  } else {
    await sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      token,
    });
  }

  return { kind: invite ? "invitation" : "password reset", email: user.email };
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
  user: Pick<IUser, "_id" | "email" | "firstName" | "status">,
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
