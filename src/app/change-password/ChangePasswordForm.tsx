"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TextField } from "@/components/ui/Field";

type FieldErrors = Record<string, string>;

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(data.get("currentPassword") ?? ""),
          newPassword: String(data.get("newPassword") ?? ""),
          confirmPassword: String(data.get("confirmPassword") ?? ""),
        }),
      });

      const payload: { error?: string; details?: FieldErrors } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not change your password.");
        if (payload.details) setFieldErrors(payload.details);
        setSubmitting(false);
        return;
      }

      startTransition(() => {
        router.replace("/dashboard");
        // The flag that was holding them here has changed server-side.
        router.refresh();
      });
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setSubmitting(false);
    }
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
        label={forced ? "Password you were given" : "Current password"}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        error={fieldErrors.currentPassword}
      />
      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={fieldErrors.newPassword}
      />
      <TextField
        label="Repeat new password"
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
        {busy ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}
