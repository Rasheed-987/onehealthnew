"use client";

import { useState } from "react";
import { AlertTriangle, UserMinus, UserPlus } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Badge, SelectField } from "@/components/ui/Field";
import { Pagination } from "@/components/dashboard/Pagination";
import { SearchInput } from "@/components/dashboard/SearchInput";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  queryKeys,
  useAssignableStudentsQuery,
  useClassroomRosterQuery,
  useInvalidate,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { ClassroomRow } from "@/lib/classrooms";

/**
 * The "View Students" panel: who is in the room, and moving children in or out.
 */
export function RosterModal({
  classroom,
  canAssign,
  onClose,
}: {
  classroom: ClassroomRow;
  canAssign: boolean;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const invalidate = useInvalidate();

  const debouncedSearch = useDebouncedValue(search, 300);
  const roster = useClassroomRosterQuery(classroom.id, {
    search: debouncedSearch,
    page,
  });
  // The picker fails quietly: the roster still reads without it, which is
  // better than blocking the read on a list only the add control needs.
  const assignable = useAssignableStudentsQuery(canAssign);

  const students = roster.data?.students ?? [];
  const usedSeats = roster.data?.classroom.usedSeats ?? classroom.usedSeats;
  const options = assignable.data?.students ?? [];

  // A failed write says so until the next one; a failed read says so until it
  // succeeds. Both land in the same box, the write first because it is the
  // thing that just happened.
  const error =
    actionError ??
    (roster.isError
      ? errorMessage(roster.error, "Could not load the roster.")
      : null);

  /**
   * Moving a child in or out changes the roster, the seat count on the
   * homeroom row, the child's own row, who is left to pick from, and every
   * screen built from a room's roster - so this marks all of it stale rather
   * than refetching two endpoints by hand and leaving the rest to drift.
   */
  function afterRosterChange() {
    invalidate(
      queryKeys.classrooms.all,
      queryKeys.students.all,
      queryKeys.attendance.all,
      queryKeys.dailyProgress.all,
      queryKeys.weeklyProgress.all,
    );
  }

  async function enrol() {
    if (!picked) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/classrooms/${classroom.id}/students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student: picked }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(payload.error ?? "Could not add the child.");
        return;
      }
      setPicked("");
      afterRosterChange();
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(student: { id: string; fullName: string }) {
    setBusy(true);
    setActionError(null);
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
        setActionError(payload.error ?? "Could not remove the child.");
        return;
      }
      afterRosterChange();
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
              <SelectField
                label="Add a child"
                name="enrol-student"
                value={picked}
                onChange={(event) => setPicked(event.target.value)}
                placeholder="Choose a child..."
                options={selectable.map((option) => ({
                  value: option.id,
                  label: `${option.fullName} (${option.age})${
                    option.parentName ? ` • Parent: ${option.parentName}` : ""
                  }${option.currentClassroomId ? " - currently seated" : ""}`,
                }))}
              />
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

        <div className="mb-4">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search students by name or ID..."
            aria-label="Search roster students"
          />
        </div>

        {roster.isPending ? (
          <p className="py-6 text-center text-sm text-muted">Loading...</p>
        ) : students.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {search ? "No matching children found." : "No children in this room yet."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-control border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-muted">
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Parent</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((student) => {
                    const parentNames =
                      student.guardians && student.guardians.length > 0
                        ? student.guardians.map((g) => g.name).join(", ")
                        : null;

                    return (
                      <tr
                        key={student.id}
                        className="transition-colors hover:bg-surface-hover"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="font-medium text-foreground">
                            {student.fullName}
                          </div>
                          <div className="text-xs text-muted">
                            {student.age} {student.age === 1 ? "year" : "years"}
                            {student.enrolledAt
                              ? ` • since ${student.enrolledAt.slice(0, 10)}`
                              : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {parentNames ? (
                            <div className="text-sm text-foreground">
                              {parentNames}
                            </div>
                          ) : (
                            <span className="text-sm text-subtle">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!student.isActive && (
                              <Badge tone="neutral">Inactive</Badge>
                            )}
                            {canAssign && (
                              <button
                                type="button"
                                onClick={() => withdraw(student)}
                                disabled={busy}
                                aria-label={`Remove ${student.fullName} from ${classroom.name}`}
                                className="inline-flex items-center gap-1.5 rounded-control border border-danger/30 bg-danger-subtle px-2.5 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger hover:text-danger-foreground disabled:opacity-50"
                              >
                                <UserMinus size={14} />
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {roster.data?.pagination && (
              <Pagination
                pagination={roster.data.pagination}
                onPageChange={setPage}
              />
            )}
          </div>
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

