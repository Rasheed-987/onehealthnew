"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { TextField } from "@/components/ui/Field";

type FieldErrors = Record<string, string>;

/**
 * Shared by "accept invitation" and "reset password" - both are the same act
 * (redeem a token, choose a password) and differ only in where they land
 * afterwards.
 */
export function SetPasswordForm({
  token,
  endpoint,
  submitLabel,
  /** Where to go on success, and whether the user arrives signed in. */
  redirectTo,
  successMessage,
}: {
  token: string;
  endpoint: string;
  submitLabel: string;
  redirectTo: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = submitting || isPending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: String(data.get("password") ?? ""),
          confirmPassword: String(data.get("confirmPassword") ?? ""),
        }),
      });
      const payload: { error?: string; details?: FieldErrors } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Something went wrong. Please try again.");
        if (payload.details) setFieldErrors(payload.details);
        setSubmitting(false);
        return;
      }

      if (successMessage) {
        // A reset ends signed out, so there is nothing to navigate into -
        // confirm it worked and point at the sign-in page instead.
        setDone(true);
        setSubmitting(false);
        return;
      }

      startTransition(() => {
        router.replace(redirectTo);
        router.refresh();
      });
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setSubmitting(false);
    }
  }

  if (done && successMessage) {
    return (
      <div className="mt-6">
        <p className="rounded-control border border-primary/25 bg-primary-subtle px-3 py-2 text-sm text-primary-active">
          {successMessage}
        </p>
        <Link
          href={redirectTo}
          className="mt-4 block w-full rounded-control bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Go to sign in
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
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
        hint="At least 8 characters."
        error={fieldErrors.password}
      />
      <TextField
        label="Repeat password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.confirmPassword}
      />

      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

/** Shown when a link is dead, in place of a form that could never succeed. */
export function DeadLink({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="mt-6">
      <p className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">
        {title}
      </p>
      <p className="mt-3 text-sm text-muted">{message}</p>
      <Link
        href={action.href}
        className="mt-4 block w-full rounded-control border border-border-strong bg-surface px-4 py-2.5 text-center text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
      >
        {action.label}
      </Link>
    </div>
  );
}
