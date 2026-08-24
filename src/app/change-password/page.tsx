import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata: Metadata = {
  title: "Change password | Letters and Numbers",
};

/**
 * Deliberately outside the dashboard shell.
 *
 * The shell redirects here whenever `mustChangePassword` is set, so rendering
 * this page inside it would be a redirect loop. Keeping it standalone also
 * means someone on a borrowed password sees no navigation to wander into.
 */
export default async function ChangePasswordPage() {
  const user = await requireUser("/change-password");
  const forced = user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-8 shadow-overlay">
        <BrandMark className="mx-auto h-20 w-20" />

        <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          {forced ? "Choose your own password" : "Change your password"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {forced
            ? `Your account was set up by an administrator, who chose the password you signed in with. Pick your own before you continue.`
            : `Signed in as ${user.email}.`}
        </p>

        <ChangePasswordForm forced={forced} />

        {!forced && (
          <Link
            href="/dashboard"
            className="mt-4 block text-center text-sm text-muted transition-colors hover:text-foreground"
          >
            Back to dashboard
          </Link>
        )}
      </div>
    </main>
  );
}
