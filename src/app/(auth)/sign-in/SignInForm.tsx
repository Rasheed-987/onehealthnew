"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** Field-level messages returned by the API, keyed by field name. */
type FieldErrors = Record<string, string>;

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // `isPending` covers the router refresh too, so the button stays disabled
  // until the new page is actually on screen rather than flicking back to
  // "Sign in" while the navigation is still in flight.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isSubmitting || isPending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          rememberMe: data.get("rememberMe") === "on",
        }),
      });

      const payload: { error?: string; details?: FieldErrors } =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not sign in. Please try again.");
        if (payload.details) setFieldErrors(payload.details);
        setIsSubmitting(false);
        return;
      }

      startTransition(() => {
        router.replace(redirectTo);
        // The session cookie is new, so every server component on the target
        // route has to be re-rendered with it.
        router.refresh();
      });
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setIsSubmitting(false);
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

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="john@example.com"
        error={fieldErrors.email}
        autoFocus
      />

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="password"
            className="text-sm font-medium text-foreground"
          >
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-primary transition-colors hover:text-primary-hover hover:underline"
          >
            Forgot Password?
          </Link>
        </div>
        <div className="relative mt-1.5">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? "password-error" : undefined
            }
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 pr-11 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-danger"
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            // The label is on the button, so the icon itself is decorative.
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-subtle transition-colors hover:text-muted focus-visible:text-muted"
          >
            <EyeIcon crossed={showPassword} />
          </button>
        </div>
        {fieldErrors.password && (
          <p id="password-error" className="mt-1.5 text-sm text-danger">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="rememberMe"
          className="h-4 w-4 cursor-pointer rounded-sm border-border-strong accent-primary"
        />
        Remember Me
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-1 w-full rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  ...inputProps
}: {
  label: string;
  name: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-danger"
        {...inputProps}
      />
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <line x1="3" y1="21" x2="21" y2="3" />}
    </svg>
  );
}
