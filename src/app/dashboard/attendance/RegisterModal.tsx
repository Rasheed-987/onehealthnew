"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useAttendanceRegisterQuery } from "@/hooks/queries";
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABEL,
  type AttendanceStatus,
} from "@/models/enums";

/**
 * Taking the register for one room and one day, or correcting one already taken.
 *
 * The roster is fetched from `/api/attendance/register`, which left-joins the
 * marks made so far, so an untouched child shows up unset and a day marked
 * weeks ago comes back filled in. The whole sheet POSTs to `/api/attendance` -
 * the same upsert the mobile app uses - and that route only refuses a *future*
 * day, so editing a previous one needs nothing special here.
 *
 * A child left unset is simply omitted from the submission rather than sent as
 * a blank: not marking someone is not the same as marking them absent, and the
 * route has no way to clear a line anyway.
 */

const STATUSES = Object.values(ATTENDANCE_STATUS);

interface RowDraft {
  status: AttendanceStatus | null;
  note: string;
}

export function RegisterModal({
  classroomId,
  classroomName,
  date,
  onClose,
  onSaved,
}: {
  classroomId: string;
  classroomName: string;
  /** "2026-09-02". */
  date: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const sheet = useAttendanceRegisterQuery(date, classroomId);
  const entries = useMemo(() => sheet.data?.entries ?? [], [sheet.data]);

  const [draft, setDraft] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  // The server's marks are the baseline; `draft` only holds what this session
  // has changed, so a re-fetch while the modal is open never clobbers an edit.
  const rowFor = (studentId: string): RowDraft => {
    if (draft[studentId]) return draft[studentId];
    const entry = entries.find((e) => e.student.id === studentId);
    return {
      status: entry?.status ?? null,
      note: entry?.note ?? "",
    };
  };

  const update = (studentId: string, patch: Partial<RowDraft>) => {
    setDraft((current) => ({
      ...current,
      [studentId]: { ...rowFor(studentId), ...patch },
    }));
  };

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    const next = rowFor(studentId).status === status ? null : status;
    update(studentId, { status: next });
  };

  const markAllPresent = () => {
    setDraft((current) => {
      const next = { ...current };
      for (const entry of entries) {
        const row = next[entry.student.id] ?? rowFor(entry.student.id);
        if (row.status === null) {
          next[entry.student.id] = { ...row, status: ATTENDANCE_STATUS.PRESENT };
        }
      }
      return next;
    });
  };

  const marked = entries.filter((e) => rowFor(e.student.id).status !== null);

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors([]);
    try {
      const payload = {
        classroom: classroomId,
        date,
        entries: marked.map((entry) => {
          const row = rowFor(entry.student.id);
          return {
            student: entry.student.id,
            status: row.status,
            ...(row.note.trim() ? { note: row.note.trim() } : {}),
          };
        }),
      };

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not save the register.");
        if (body.details && typeof body.details === "object") {
          const detail = body.details as Record<string, unknown>;
          const messages = Object.values(detail).filter(
            (value): value is string => typeof value === "string",
          );
          setFieldErrors(messages);
        }
        return;
      }
      onSaved(
        `Register saved for ${classroomName} on ${date} - ${body.created ?? 0} added, ${body.updated ?? 0} updated.`,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Register - ${classroomName}`}
      description={`Taking the register for ${date}`}
      width="max-w-3xl"
    >
      <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {fieldErrors.length > 0 && (
          <ul className="list-inside list-disc rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {fieldErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        )}

        {sheet.isPending ? (
          <p className="py-8 text-center text-sm text-muted">Loading the roster...</p>
        ) : sheet.isError ? (
          <div className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            Could not load the roster for this room.
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No children are enrolled in this classroom.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {marked.length} of {entries.length} marked
              </p>
              <button
                type="button"
                onClick={markAllPresent}
                className="rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                Mark remaining present
              </button>
            </div>

            <ul className="space-y-3">
              {entries.map((entry) => {
                const row = rowFor(entry.student.id);
                return (
                  <li
                    key={entry.student.id}
                    className="rounded-control border border-border bg-surface px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-foreground">
                        {entry.student.fullName}
                        {entry.markedInThisClassroom === false &&
                          entry.status !== null && (
                            <span className="ml-2">
                              <Badge tone="warning">Marked in another room</Badge>
                            </span>
                          )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map((status) => {
                          const on = row.status === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setStatus(entry.student.id, status)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                on
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border-strong bg-surface text-foreground hover:bg-surface-hover"
                              }`}
                            >
                              {ATTENDANCE_STATUS_LABEL[status]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {row.status !== null && (
                      <div className="mt-3">
                        <input
                          value={row.note}
                          placeholder="Note (optional)"
                          aria-label={`${entry.student.fullName} note`}
                          onChange={(e) =>
                            update(entry.student.id, { note: e.target.value })
                          }
                          className={`${inputClass} w-full`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
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
          type="button"
          onClick={save}
          disabled={saving || marked.length === 0}
          className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save register"}
        </button>
      </div>
    </Modal>
  );
}

const inputClass =
  "rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25";
