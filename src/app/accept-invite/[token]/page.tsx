import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";
import { DeadLink, SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { connectDB } from "@/lib/db";
import { inspectToken } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";

export const metadata: Metadata = {
  title: "Accept invitation | Letters and Numbers",
};

const REASON = {
  "not-found": {
    title: "This invitation link is not valid.",
    message:
      "It may have been mistyped, or the account may have been removed. Ask your administrator to send a new invitation.",
  },
  expired: {
    title: "This invitation has expired.",
    message:
      "Invitations are valid for seven days. Ask your administrator to send a new one.",
  },
  used: {
    title: "This invitation has already been used.",
    message:
      "Your account is set up. Sign in with the password you chose, or reset it if you have forgotten it.",
  },
} as const;

export default async function AcceptInvitePage({
  params,
}: PageProps<"/accept-invite/[token]">) {
  const { token } = await params;
  await connectDB();

  /*
   * Inspected, not consumed. Rendering the page must not spend the token -
   * otherwise a mail client that prefetches links would burn the invitation
   * before the recipient ever saw it.
   */
  const result = await inspectToken(token, TOKEN_TYPE.INVITE);
  const user = result.ok ? await User.findById(result.userId) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-8 shadow-overlay">
        <BrandMark className="mx-auto h-20 w-20" />

        {!result.ok || !user ? (
          <>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              Invitation problem
            </h1>
            <DeadLink
              title={
                result.ok
                  ? "This invitation is no longer valid."
                  : REASON[result.reason].title
              }
              message={
                result.ok
                  ? "The account it belonged to no longer exists."
                  : REASON[result.reason].message
              }
              action={{ href: "/sign-in", label: "Go to sign in" }}
            />
          </>
        ) : (
          <>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              Welcome, {user.firstName}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Choose a password for <strong>{user.email}</strong> to activate
              your account.
            </p>
            <SetPasswordForm
              token={token}
              endpoint="/api/auth/accept-invite"
              submitLabel="Activate my account"
              redirectTo="/dashboard"
            />
          </>
        )}
      </div>
    </main>
  );
}
