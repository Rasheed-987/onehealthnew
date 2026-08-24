import { redirect } from "next/navigation";

import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { User, type IUser } from "@/models";

/**
 * The signed-in user, or a redirect to sign-in.
 *
 * Server components call this rather than `getSession()` when they need the
 * person and not just the id - it is the one place that turns "there is a
 * valid token" into "there is still an account behind it".
 */
export interface CurrentUser {
  id: string;
  email: string;
  role: IUser["role"];
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  status: IUser["status"];
  /** True until the holder replaces the password an admin set for them. */
  mustChangePassword: boolean;
}

export async function requireUser(pathname = "/dashboard"): Promise<CurrentUser> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(pathname)}`);

  await connectDB();
  const user = await User.findById(session.userId);
  // Signature checks out but the account is gone - a deleted user holding a
  // cookie that has not expired yet.
  if (!user) redirect("/sign-in");

  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    avatarUrl: user.avatarUrl ?? null,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
  };
}
