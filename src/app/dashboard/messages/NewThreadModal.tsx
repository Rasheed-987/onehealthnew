"use client";

import { useMemo, useState } from "react";

import { SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useMessageOptionsQuery } from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import { MESSAGE_MAX_LENGTH } from "@/models/enums";

/**
 * Starting a conversation.
 *
 * Two selects and a first message. The teacher select is present for both
 * roles even though a teacher only ever has themselves in it - the API returns
 * one shape for both directions, and collapsing it here would mean two versions
 * of this form to keep in step.
 *
 * The first message is required. A thread with nothing in it would sit in the
 * other person's inbox saying nothing, which is not what anyone pressing "start
 * a conversation" meant.
 */
export function NewThreadModal({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  /** Hands back the thread to show - existing or just created. */
  onOpened: (threadId: string, isNew: boolean) => void;
}) {
  /*
   * Null means "not answered yet", which is what lets the sole-option default
   * below be derived rather than written into state once the list lands. An
   * explicit "" is an answer - the reader choosing the blank option - and
   * overrides the default like any other.
   */
  const [studentChoice, setStudentChoice] = useState<string | null>(null);
  const [teacherChoice, setTeacherChoice] = useState<string | null>(null);
  const [body, setBody] = useState("");

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const options = useMessageOptionsQuery(open);
  // Memoised so the identity is stable between renders - it feeds a useMemo
  // below, which would otherwise recompute on every one.
  const recipients = useMemo(() => options.data?.students ?? [], [options.data]);
  const loading = options.isPending;
  const loadError = options.isError
    ? errorMessage(options.error, "Could not load the list.")
    : null;

  /*
   * Pre-select the only sensible answer when there is only one - common for a
   * guardian with one child in a room with one teacher.
   *
   * Read off the list rather than written into state when it arrives, so there
   * is no moment where the form disagrees with what is on screen and no way
   * for a refetch to reach back in and undo a choice since made.
   */
  const only = recipients.length === 1 ? recipients[0] : null;
  const studentId = studentChoice ?? only?.id ?? "";
  const teacherId =
    teacherChoice ??
    (only?.teachers.length === 1 ? only.teachers[0].id : "");

  const student = useMemo(
    () => recipients.find((r) => r.id === studentId) ?? null,
    [recipients, studentId],
  );

  /**
   * Choosing a different child invalidates whichever teacher was picked for the
   * last one, so the two selects move together. Done on the change rather than
   * in an effect watching `studentId`: the teacher is not derived state, it is
   * a second answer that this answer invalidates.
   */
  function chooseStudent(id: string) {
    setStudentChoice(id);
    const next = recipients.find((r) => r.id === id) ?? null;
    setTeacherChoice(
      next && next.teachers.length === 1 ? next.teachers[0].id : "",
    );
  }

  const teacher = student?.teachers.find((t) => t.id === teacherId) ?? null;
  const existingThreadId = teacher?.threadId ?? null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Already talking. Open that conversation rather than asking the server for
    // a second one it would refuse to make.
    if (existingThreadId) {
      onOpened(existingThreadId, false);
      return;
    }

    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/messages/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: studentId,
          teacher: teacherId,
          body: body.trim(),
        }),
      });
      const payload: {
        error?: string;
        details?: Record<string, string>;
        thread?: { id: string };
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not start the conversation.");
        if (payload.details) setFieldErrors(payload.details);
        setBusy(false);
        return;
      }

      if (payload.thread) onOpened(payload.thread.id, true);
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  const ready = studentId !== "" && teacherId !== "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New conversation"
      description="Everyone listed as this child's guardian will be able to read it."
    >
      <form onSubmit={submit}>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          {loadError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {loadError}
            </p>
          )}
          {formError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted">
              There is nobody to message yet. A conversation needs a child who
              has been placed in a classroom with a teacher assigned to it.
            </p>
          ) : (
            <>
              <SelectField
                label="Child"
                name="student"
                value={studentId}
                error={fieldErrors.student}
                onChange={(event) => chooseStudent(event.target.value)}
                options={[
                  { value: "", label: "Choose a child" },
                  ...recipients.map((r) => ({
                    value: r.id,
                    label: r.classroom
                      ? `${r.fullName} — ${r.classroom.name}`
                      : r.fullName,
                  })),
                ]}
              />

              {student && student.teachers.length === 1 ? (
                /*
                 * No choice to make - a teacher only ever messages as
                 * themselves, and a one-teacher room answers the question for a
                 * guardian too. Show who it is rather than a select with one
                 * option; the auto-selection above has already filled the form.
                 */
                <div>
                  <span className="text-sm font-medium text-foreground">
                    Teacher
                  </span>
                  <p className="mt-1.5 rounded-control border border-border bg-surface-muted px-3 py-2 text-sm text-foreground">
                    {teacher?.label ?? student.teachers[0].label}
                  </p>
                </div>
              ) : (
                <SelectField
                  label="Teacher"
                  name="teacher"
                  value={teacherId}
                  disabled={!student}
                  error={fieldErrors.teacher}
                  onChange={(event) => setTeacherChoice(event.target.value)}
                  options={[
                    { value: "", label: "Choose a teacher" },
                    ...(student?.teachers ?? []).map((t) => ({
                      value: t.id,
                      label: t.threadId
                        ? `${t.label} (already talking)`
                        : t.label,
                    })),
                  ]}
                />
              )}

              {existingThreadId ? (
                <p className="rounded-control border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
                  You already have a conversation about{" "}
                  <span className="font-semibold text-foreground">
                    {student?.fullName}
                  </span>{" "}
                  with {teacher?.label}. Opening it instead of starting a second
                  one.
                </p>
              ) : (
                <div>
                  <label
                    htmlFor="body"
                    className="text-sm font-medium text-foreground"
                  >
                    First message
                    <span className="ml-0.5 text-danger">*</span>
                  </label>
                  <textarea
                    id="body"
                    name="body"
                    rows={4}
                    required
                    maxLength={MESSAGE_MAX_LENGTH}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="What would you like to say?"
                    className="mt-1.5 w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                  />
                  {fieldErrors.body && (
                    <p className="mt-1 text-sm text-danger">
                      {fieldErrors.body}
                    </p>
                  )}
                </div>
              )}
            </>
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
            disabled={
              busy ||
              !ready ||
              (!existingThreadId && body.trim() === "")
            }
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {existingThreadId
              ? "Open conversation"
              : busy
                ? "Starting…"
                : "Start conversation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
