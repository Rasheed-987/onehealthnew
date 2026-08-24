import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";
import { DeadLink, SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { connectDB } from "@/lib/db";
import { inspectToken } from "@/lib/tokens";
import { User } from "@/models";
import { TOKEN_TYPE } from "@/models/VerificationToken";

export const metadata: Metadata = {
  title: "Reset password | Letters and Numbers",
};

const REASON = {
  "not-found": {
    title: "This reset link is not valid.",
    message: "It may have been mistyped. Request a new one to try again.",
  },
  expired: {
    title: "This reset link has expired.",
    message:
      "Reset links are valid for one hour, so an old email cannot be used to take over an account. Request a new one.",
  },
  used: {
    title: "This reset link has already been used.",
    message:
      "Your password has been changed. Sign in with it, or request another reset.",
  },
} as const;

export default async function ResetPasswordPage({
  params,
}: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  await connectDB();

  // Inspected only - see the note in accept-invite: prefetching must not spend
  // the token.
  const result = await inspectToken(token, TOKEN_TYPE.PASSWORD_RESET);
  const user = result.ok ? await User.findById(result.userId) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-8 shadow-overlay">
        <BrandMark className="mx-auto h-20 w-20" />

        {!result.ok || !user ? (
          <>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              Reset problem
            </h1>
            <DeadLink
              title={
                result.ok
                  ? "This reset link is no longer valid."
                  : REASON[result.reason].title
              }
              message={
                result.ok
                  ? "The account it belonged to no longer exists."
                  : REASON[result.reason].message
              }
              action={{ href: "/forgot-password", label: "Request a new link" }}
            />
          </>
        ) : (
          <>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              Choose a new password
            </h1>
            <p className="mt-1 text-sm text-muted">
              For <strong>{user.email}</strong>.
            </p>
            <SetPasswordForm
              token={token}
              endpoint="/api/auth/reset-password"
              submitLabel="Set new password"
              redirectTo="/sign-in"
              successMessage="Your password has been changed. Sign in with it to continue."
            />
          </>
        )}
      </div>
    </main>
  );
}
