import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password | Letters and Numbers",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-border bg-surface p-8 shadow-overlay">
        <BrandMark className="mx-auto h-20 w-20" />

        <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          Forgot your password?
        </h1>
        <p className="mt-1 text-sm text-muted">
          Enter the email address on your account and we will send you a link to
          choose a new password.
        </p>

        <ForgotPasswordForm />
      </div>
    </main>
  );
}
