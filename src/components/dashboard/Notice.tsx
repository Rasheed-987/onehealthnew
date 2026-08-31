"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** The dismissible banner shown above a list after a save, delete or error. */
export function Notice({
  tone = "success",
  onDismiss,
  className,
  children,
}: {
  tone?: "success" | "danger";
  onDismiss: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start justify-between gap-3 rounded-control border px-4 py-3 text-xs",
        tone === "danger"
          ? "border-danger/30 bg-danger-subtle text-danger-strong"
          : "border-success/30 bg-success-subtle font-semibold text-success-strong",
        className,
      )}
    >
      <span>{children}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
