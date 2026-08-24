"use client";

import { useState } from "react";
import Link from "next/link";

import { TextField } from "@/components/ui/Field";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setBusy(true);

    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(data.get("email") ?? "") }),
      });
      const payload: {
        message?: string;
        error?: string;
        details?: Record<string, string>;
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not send the reset link.");
        if (payload.details) setFieldErrors(payload.details);
        setBusy(false);
        return;
      }

      // Deliberately the same confirmation whether or not the address exists;
      // the API answers identically for the same reason.
      setSent(payload.message ?? "If that email has an account, a link is on its way.");
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6">
        <p className="rounded-control border border-primary/25 bg-primary-subtle px-3 py-2 text-sm text-primary-active">
          {sent}
        </p>
        <p className="mt-3 text-sm text-muted">
          The link is valid for one hour. Check your spam folder if it does not
          arrive.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 block w-full rounded-control border border-border-strong bg-surface px-4 py-2.5 text-center text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
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
        {busy ? "Sending..." : "Email me a reset link"}
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
