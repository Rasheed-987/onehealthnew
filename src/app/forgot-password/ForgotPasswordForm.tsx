"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { TextField } from "@/components/ui/Field";

export function ForgotPasswordForm() {
  const [step, setStep] = useState<"email" | "verify" | "success">("email");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Timer countdown for resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSendOtp(targetEmail: string) {
    setFormError(null);
    setFieldErrors({});
    setBusy(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const payload: {
        message?: string;
        error?: string;
        details?: Record<string, string>;
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not send verification code.");
        if (payload.details) setFieldErrors(payload.details);
        setBusy(false);
        return;
      }

      setEmail(targetEmail);
      setStep("verify");
      setCooldown(60);
      setBusy(false);
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  async function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const submittedEmail = String(data.get("email") ?? "").trim();
    await handleSendOtp(submittedEmail);
  }

  async function onResetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setBusy(true);

    const data = new FormData(event.currentTarget);
    const otp = String(data.get("otp") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, password, confirmPassword }),
      });

      const payload: {
        message?: string;
        error?: string;
        details?: Record<string, string>;
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Failed to reset password.");
        if (payload.details) setFieldErrors(payload.details);
        setBusy(false);
        return;
      }

      setStep("success");
      setBusy(false);
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  if (step === "success") {
    return (
      <div className="mt-6">
        <p className="rounded-control border border-primary/25 bg-primary-subtle px-3.5 py-3 text-sm text-primary-active">
          Your password has been changed successfully.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 block w-full rounded-control bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover text-center"
        >
          Sign in with new password
        </Link>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <form onSubmit={onResetSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <div className="rounded-control border border-border bg-surface-subtle p-3 text-sm text-muted">
          <p>
            We sent a 6-digit verification code to <span className="font-semibold text-foreground">{email}</span>.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setFormError(null);
            }}
            className="mt-1 text-xs text-primary underline transition-colors hover:text-primary-hover"
          >
            Use a different email address
          </button>
        </div>

        {formError && (
          <p
            role="alert"
            className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}

        <TextField
          label="Verification Code"
          name="otp"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          placeholder="6-digit code"
          error={fieldErrors.otp}
        />

        <TextField
          label="New Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          error={fieldErrors.password}
        />

        <TextField
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Repeat the new password"
          error={fieldErrors.confirmPassword}
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-1 w-full rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Updating..." : "Reset Password"}
        </button>

        <div className="mt-2 text-center text-xs text-muted">
          Didn&apos;t receive code?{" "}
          <button
            type="button"
            disabled={cooldown > 0 || busy}
            onClick={() => handleSendOtp(email)}
            className="font-medium text-primary hover:text-primary-hover disabled:cursor-not-allowed disabled:text-muted"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
          </button>
        </div>

        <Link
          href="/sign-in"
          className="mt-2 text-center text-sm text-muted transition-colors hover:text-foreground"
        >
          Back to sign in
        </Link>
      </form>
    );
  }

  return (
    <form onSubmit={onEmailSubmit} noValidate className="mt-6 flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="you@example.com"
        error={fieldErrors.email}
      />

      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Sending..." : "Send Verification Code"}
      </button>

      <Link
        href="/sign-in"
        className="text-center text-sm text-muted transition-colors hover:text-foreground"
      >
        Back to sign in
      </Link>
    </form>
  );
}
