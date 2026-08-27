import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Reset password | Letters and Numbers",
};

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-8 shadow-overlay text-center">
        <BrandMark className="mx-auto h-20 w-20" />
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          Password Reset Verification Code
        </h1>
        <p className="mt-3 text-sm text-muted">
          Password resets now use a 6-digit verification code sent directly to your email address.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 block w-full rounded-control bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover"
        >
          Go to Password Reset
        </Link>
      </div>
    </main>
  );
}
