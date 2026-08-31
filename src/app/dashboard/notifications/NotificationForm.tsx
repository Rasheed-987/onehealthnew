"use client";

import { useState } from "react";

import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useAudienceOptionsQuery } from "@/hooks/queries";
import type { NotificationRow } from "@/lib/notifications";
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
  type NotificationRoleTarget,
} from "@/models/enums";
import {
  AudiencePicker,
  valueFromDraft,
  type Draft,
} from "./AudiencePicker";

/**
 * Writing or editing a notice.
 *
 * One form for both, because they differ only in where the request goes: a
 * notice is edited by the same person who wrote it, minutes later, with the
 * same audience question in front of them. Splitting them would mean keeping
 * two copies of the picker in step.
 */

/** An existing notice, back in the shape the picker works with. */
function draftFor(notification: NotificationRow | null): Draft {
  const audience = notification?.audience;
  const ids = audience?.targets.map((target) => target.id) ?? [];

  return {
    kind: audience?.kind ?? NOTIFICATION_AUDIENCE.ALL,
    roles:
      audience?.kind === NOTIFICATION_AUDIENCE.ROLE
        ? (ids as NotificationRoleTarget[])
        : [],
    classrooms:
      audience?.kind === NOTIFICATION_AUDIENCE.CLASSROOM ? ids : [],
    students: audience?.kind === NOTIFICATION_AUDIENCE.STUDENT ? ids : [],
  };
}

export function NotificationForm({
  notification,
  onClose,
  onSaved,
}: {
  /** Null to write a new one. */
  notification: NotificationRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(notification?.title ?? "");
  const [body, setBody] = useState(notification?.body ?? "");
  const [draft, setDraft] = useState<Draft>(() => draftFor(notification));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Shared through the cache, so opening the composer twice while drafting
  // costs one request rather than two.
  const audienceQuery = useAudienceOptionsQuery();

  const editing = notification !== null;

  async function submit() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const response = await fetch(
        editing ? `/api/notifications/${notification.id}` : "/api/notifications",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            audience: valueFromDraft(draft),
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "Could not save the notification.");
        if (payload.details && typeof payload.details === "object") {
          setFieldErrors(payload.details as Record<string, string>);
        }
        return;
      }

      onSaved(
        editing
          ? `Notification updated. It now goes to ${payload.notification?.audience?.label ?? "the new audience"}.`
          : `Notification sent to ${payload.notification?.audience?.label ?? "the chosen audience"}.`,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  /*
   * The API reports an audience problem against the path it validated -
   * `audience.classrooms`, `audience.students`, `audience.roles` - so any of
   * them belongs under the picker rather than beside a field that does not
   * exist on this form.
   */
  const audienceError =
    fieldErrors["audience.classrooms"] ??
    fieldErrors["audience.students"] ??
    fieldErrors["audience.roles"] ??
    fieldErrors.audience;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit notification" : "Add notification"}
      description="Choose who it is for, then write it."
      width="max-w-2xl"
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <AudiencePicker
          draft={draft}
          onChange={setDraft}
          options={audienceQuery.data}
          loading={audienceQuery.isPending}
          error={audienceError}
        />

        <TextField
          label="Headline"
          name="title"
          value={title}
          maxLength={NOTIFICATION_TITLE_MAX_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nursery closed on Friday"
          error={fieldErrors.title}
          hint="Optional. The notification below is enough on its own."
        />

        <div>
          <label htmlFor="body" className="text-sm font-medium text-foreground">
            Notification<span className="ml-0.5 text-danger">*</span>
          </label>
          <textarea
            id="body"
            rows={4}
            value={body}
            maxLength={NOTIFICATION_MAX_LENGTH}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What the school needs everyone to know"
            aria-invalid={Boolean(fieldErrors.body)}
            className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-danger"
          />
          {fieldErrors.body ? (
            <p className="mt-1 text-sm text-danger">{fieldErrors.body}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              {body.trim().length} / {NOTIFICATION_MAX_LENGTH}
            </p>
          )}
        </div>
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
          type="button"
          onClick={submit}
          disabled={saving}
          className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saving
            ? "Saving..."
            : editing
              ? "Save changes"
              : "Send notification"}
        </button>
      </div>
    </Modal>
  );
}
