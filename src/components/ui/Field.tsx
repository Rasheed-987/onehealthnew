"use client";

/** Label + control + error message, so every form row lines up identically. */
export function TextField({
  label,
  name,
  error,
  hint,
  required,
  ...inputProps
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-danger"
        {...inputProps}
      />
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${name}-hint`} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  options,
  ...selectProps
}: {
  label: string;
  name: string;
  error?: string;
  options: readonly { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-danger"
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "success" | "danger" | "warning" | "neutral";
  children: React.ReactNode;
}) {
  const tones = {
    success: "bg-success-subtle text-success",
    danger: "bg-danger-subtle text-danger",
    warning: "bg-warning/15 text-warning",
    neutral: "bg-surface-muted text-muted",
  } as const;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
