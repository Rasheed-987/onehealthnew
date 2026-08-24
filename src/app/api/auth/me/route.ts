import { handle, ok, ApiError } from "@/lib/api";
import { requireSession } from "@/lib/api";
import { User } from "@/models";

/** The signed-in user, for the client to hydrate its header and nav from. */
export async function GET() {
  return handle(async () => {
    const session = await requireSession();
    const user = await User.findById(session.userId);
    // The token outlived the account - a deleted user with a still-valid
    // cookie. Treat it as signed out rather than 500ing on a null document.
    if (!user) throw new ApiError(401, "You must be signed in.");

    return ok({
      user: {
        id: String(user._id),
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl ?? null,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      },
    });
  });
}
