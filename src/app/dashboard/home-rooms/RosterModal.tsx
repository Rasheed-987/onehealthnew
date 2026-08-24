"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, UserMinus, UserPlus } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Field";
import type { ClassroomRow } from "@/lib/classrooms";

interface RosterStudent {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  isActive: boolean;
  enrolledAt: string | null;
}

interface StudentOption {
  id: string;
  fullName: string;
  age: number;
  currentClassroomId: string | null;
}

/**
 * The "View Students" panel: who is in the room, and moving children in or out.
 */
export function RosterModal({
  classroom,
  canAssign,
  onClose,
  onChanged,
}: {
  classroom: ClassroomRow;
  canAssign: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [usedSeats, setUsedSeats] = useState(classroom.usedSeats);
  const [options, setOptions] = useState<StudentOption[]>([]);
  const [picked, setPicked] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRoster = useCallback(async () => {
    // No setLoading(true) here: `loading` starts true for the first fetch, and
    // later refreshes are already covered by `busy`. Setting it synchronously
    // would also make this a state update during the mount effect.
    try {
      const response = await fetch(`/api/classrooms/${classroom.id}/students`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not load the roster.");
        return;
      }
      setStudents(payload.students);
      setUsedSeats(payload.classroom.usedSeats);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [classroom.id]);

  const loadOptions = useCallback(async () => {
    if (!canAssign) return;
    try {
      const response = await fetch("/api/students/options");
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setOptions(payload.students);
    } catch {
      // The roster still renders without the picker; failing quietly here is
      // better than blocking the read.
    }
  }, [canAssign]);

  /*
   * The first load runs inside the effect rather than by calling the two
   * refresh helpers, which keeps every state update behind an await instead of
   * firing synchronously while the effect body runs.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadRoster();
      if (!cancelled) await loadOptions();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRoster, loadOptions]);

  async function enrol() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/classrooms/${classroom.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student: picked }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not add the child.");
        return;
      }
      setPicked("");
      await loadRoster();
      await loadOptions();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(student: RosterStudent) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/classrooms/${classroom.id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: student.id,
          status: "WITHDRAWN",
          note: `Removed from ${classroom.name}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not remove the child.");
        return;
      }
      await loadRoster();
      await loadOptions();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Children already here have nothing to pick; everyone else is offered, with
  // their current room shown so a transfer is never accidental.
  const selectable = options.filter(
    (option) => option.currentClassroomId !== classroom.id,
  );

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={`${classroom.name} - students`}
      description={`${usedSeats} of ${classroom.capacity} seats used${
        usedSeats > classroom.capacity ? " (over capacity)" : ""
      }`}
    >
      <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {usedSeats > classroom.capacity && (
          <p className="mb-3 flex items-center gap-2 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <AlertTriangle size={16} className="shrink-0 text-warning" />
            This room is {usedSeats - classroom.capacity} over its stated
            capacity.
          </p>
        )}

        {canAssign && (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <label htmlFor="enrol-student" className="text-xs text-muted">
                Add a child
              </label>
              <select
                id="enrol-student"
                value={picked}
                onChange={(event) => setPicked(event.target.value)}
                className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
              >
                <option value="">Choose a child...</option>
                {selectable.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.fullName} ({option.age})
                    {option.currentClassroomId ? " - currently seated" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={enrol}
              disabled={!picked || busy}
              className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              <UserPlus size={15} />
              Add
            </button>
          </div>
        )}

        {loading ? (
          <p className="py-6 text-center text-sm text-muted">Loading...</p>
        ) : students.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No children in this room yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {students.map((student) => (
              <li
                key={student.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {student.fullName}
                  </div>
                  <div className="text-xs text-muted">
                    {student.age} {student.age === 1 ? "year" : "years"}
                    {student.enrolledAt
                      ? ` - since ${student.enrolledAt.slice(0, 10)}`
                      : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!student.isActive && <Badge tone="neutral">Inactive</Badge>}
                  {canAssign && (
                    <button
                      type="button"
                      onClick={() => withdraw(student)}
                      disabled={busy}
                      aria-label={`Remove ${student.fullName} from ${classroom.name}`}
                      className="flex items-center gap-1.5 rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                    >
                      <UserMinus size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
