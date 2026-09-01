"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import { TEACHER_TITLE } from "@/models/enums";
import type { TeacherRow } from "@/lib/teachers";

const TITLE_OPTIONS = Object.values(TEACHER_TITLE).map((title) => ({
  value: title,
  label: title,
}));

type FieldErrors = Record<string, string>;

/**
 * One form for both create and edit. `teacher` being present is what switches
 * it: email and password only exist on create, because changing a sign-in
 * address is an account operation, not a profile edit.
 */
export function TeacherForm({
  open,
  teacher,
  onClose,
  onSaved,
}: {
  open: boolean;
  teacher: TeacherRow | null;
  onClose: () => void;
  onSaved: (result: { message: string; warning?: string }) => void;
}) {
  const isEdit = teacher !== null;
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
      title: text("title"),
      employeeId: text("employeeId"),
      specialization: text("specialization"),
      joinedAt: text("joinedAt"),
    };

    if (!isEdit) {
      body.email = text("email");
    } else {
      body.isActive = data.get("isActive") === "on";
    }

    try {
      const response = await fetch(
        isEdit ? `/api/teachers/${teacher.id}` : "/api/teachers",
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
          ? "Teacher updated."
          : `Teacher created. An invitation was sent to ${text("email")}.`,
        // The teacher exists either way; only the email failed. Say so, so the
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
      title={isEdit ? "Edit teacher" : "Add teacher"}
      description={
        isEdit
          ? "Update this teacher's profile and account details."
          : "Creates the account and emails an invitation to set a password."
      }
    >
      {/* `key` remounts the form when the target changes, so defaultValue is
          re-read instead of showing the previous teacher's details. */}
      <form key={teacher?.id ?? "new"} onSubmit={onSubmit} noValidate>
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
              defaultValue={teacher?.firstName ?? ""}
              error={fieldErrors.firstName}
            />
            <TextField
              label="Last name"
              name="lastName"
              required
              defaultValue={teacher?.lastName ?? ""}
              error={fieldErrors.lastName}
            />
          </div>

          {!isEdit && (
            <TextField
              label="Email"
              name="email"
              type="email"
              required
              placeholder="teacher@example.com"
              hint="An invitation to choose a password is sent here."
              error={fieldErrors.email}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Title"
              name="title"
              options={TITLE_OPTIONS}
              defaultValue={teacher?.title ?? TEACHER_TITLE.MS}
              error={fieldErrors.title}
            />
            <TextField
              label="Phone"
              name="phone"
              type="tel"
              defaultValue={teacher?.phone ?? ""}
              error={fieldErrors.phone}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Employee ID"
              name="employeeId"
              defaultValue={teacher?.employeeId ?? ""}
              hint="Optional, but must be unique."
              error={fieldErrors.employeeId}
            />
            <TextField
              label="Specialization"
              name="specialization"
              placeholder="Early literacy"
              defaultValue={teacher?.specialization ?? ""}
              error={fieldErrors.specialization}
            />
          </div>

          <TextField
            label="Joined on"
            name="joinedAt"
            type="date"
            defaultValue={teacher?.joinedAt ? teacher.joinedAt.slice(0, 10) : ""}
            error={fieldErrors.joinedAt}
          />

          {isEdit && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={teacher.isActive}
                className="h-4 w-4 cursor-pointer rounded-sm border-border-strong accent-primary"
              />
              Active member of staff
            </label>
          )}
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
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create teacher"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
