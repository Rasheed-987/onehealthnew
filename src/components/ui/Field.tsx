"use client";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/** Label + control + error message, so every form row lines up identically. */
export function TextField({
  label,
  name,
  error,
  hint,
  required,
  className,
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
      <label htmlFor={name} className="text-xs font-bold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className={cn(
          "mt-1.5 w-full rounded-control border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-subtle transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger",
          className,
        )}
        {...inputProps}
      />
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs font-medium text-danger">
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
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  error?: string;
  options: readonly { value: string; label: string }[];
  className?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const triggerChange = (val: string) => {
    if (onChange) {
      // Simulate native change event for compatibility with generic form handlers
      const event = {
        target: {
          name,
          value: val,
        },
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
  };

  return (
    <div>
      <label htmlFor={name} className="text-xs font-bold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <Select
        name={name}
        value={value}
        defaultValue={defaultValue}
        onValueChange={triggerChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id={name}
          className={cn(
            "mt-1.5 h-auto py-2.5 px-3.5 w-full rounded-control border border-border bg-surface text-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger",
            className,
          )}
        >
          <SelectValue placeholder={placeholder || "Select an option..."} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
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
    warning: "bg-warning-subtle text-warning",
    neutral: "bg-surface-muted text-muted",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
