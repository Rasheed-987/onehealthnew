"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import type { ParentRow } from "@/lib/parents";

type FieldErrors = Record<string, string>;

/**
 * One form for create and edit. Email only exists on create - changing a
 * sign-in address is an account operation, not a profile edit.
 */
export function ParentForm({
  open,
  parent,
  onClose,
  onSaved,
}: {
  open: boolean;
  parent: ParentRow | null;
  onClose: () => void;
  onSaved: (result: { message: string; warning?: string }) => void;
}) {
  const isEdit = parent !== null;
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setBusy(true);

    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();

    const body: Record<string, unknown> = {
      firstName: text("firstName"),
      lastName: text("lastName"),
      phone: text("phone"),
      occupation: text("occupation"),
      address: text("address"),
      emergencyPhone: text("emergencyPhone"),
    };
    if (!isEdit) body.email = text("email");

    try {
      const response = await fetch(
        isEdit ? `/api/parents/${parent.id}` : "/api/parents",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload: {
        error?: string;
        details?: FieldErrors;
        invited?: boolean;
        inviteError?: string;
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not save. Please try again.");
        if (payload.details) setFieldErrors(payload.details);
        return;
      }

      onSaved({
        message: isEdit
          ? "Parent updated."
          : `Parent created. An invitation was sent to ${text("email")}.`,
        // The record exists either way; only the email failed. Say so, so the
        // admin knows to resend rather than assuming it arrived.
        warning:
          payload.invited === false
            ? `The invitation email could not be sent${
                payload.inviteError ? `: ${payload.inviteError}` : ""
              }. Use the resend button in the table.`
            : undefined,
      });
    } catch {
      setFormError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={isEdit ? "Edit parent" : "Add parent"}
      description={
        isEdit
          ? "Update this guardian's profile and contact details."
          : "Creates the account and emails an invitation to set a password."
      }
    >
      {/* `key` remounts on target change so defaultValue is re-read rather
          than showing the previous parent's details. */}
      <form key={parent?.id ?? "new"} onSubmit={onSubmit} noValidate>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          {formError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="First name"
              name="firstName"
              required
              defaultValue={parent?.firstName ?? ""}
              error={fieldErrors.firstName}
            />
            <TextField
              label="Last name"
              name="lastName"
              required
              defaultValue={parent?.lastName ?? ""}
              error={fieldErrors.lastName}
            />
          </div>

          {!isEdit && (
            <TextField
              label="Email"
              name="email"
              type="email"
              required
              placeholder="parent@example.com"
              hint="An invitation to choose a password is sent here."
              error={fieldErrors.email}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Phone"
              name="phone"
              type="tel"
              defaultValue={parent?.phone ?? ""}
              error={fieldErrors.phone}
            />
            <TextField
              label="Emergency phone"
              name="emergencyPhone"
              type="tel"
              hint="Used when the main number cannot be reached."
              defaultValue={parent?.emergencyPhone ?? ""}
              error={fieldErrors.emergencyPhone}
            />
          </div>

          <TextField
            label="Occupation"
            name="occupation"
            defaultValue={parent?.occupation ?? ""}
            error={fieldErrors.occupation}
          />

          <TextField
            label="Address"
            name="address"
            defaultValue={parent?.address ?? ""}
            error={fieldErrors.address}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "Saving..." : isEdit ? "Save changes" : "Create parent"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
