"use client";

import { useState } from "react";
import { Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ClassroomForm } from "./ClassroomForm";
import { RosterModal } from "./RosterModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useClassroomsQuery,
  useInvalidate,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { ClassroomRow } from "@/lib/classrooms";

export function HomeRoomsClient({
  canDelete,
  canAssign,
}: {
  canDelete: boolean;
  canAssign: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomRow | null>(null);
  const [deleting, setDeleting] = useState<ClassroomRow | null>(null);
  const [viewing, setViewing] = useState<ClassroomRow | null>(null);

  const invalidate = useInvalidate();

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isPending, isError, error } = useClassroomsQuery(
    debouncedSearch,
    page,
  );

  const classrooms = data?.classrooms ?? [];
  const pagination = data?.pagination ?? EMPTY_PAGINATION;
  const loadError = isError
    ? errorMessage(error, "Could not load homerooms.")
    : null;

  function afterSave(message: string) {
    setFormOpen(false);
    setEditing(null);
    setNotice(message);
    // Teachers carry the rooms they run on their own row.
    invalidate(queryKeys.classrooms.all, queryKeys.teachers.all);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/classrooms/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWarning(payload.error ?? "Could not delete the homeroom.");
    } else {
      setNotice(`${deleting.name} was deleted.`);
    }
    setDeleting(null);
    // A deleted room un-enrols its children and releases its teachers, so
    // both of those lists - and everything drawn from the roster - are stale.
    invalidate(
      queryKeys.classrooms.all,
      queryKeys.students.all,
      queryKeys.teachers.all,
      queryKeys.attendance.all,
      queryKeys.dailyProgress.all,
      queryKeys.weeklyProgress.all,
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name or room"
            aria-label="Search homerooms"
            className="w-full rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Plus size={16} />
          Add Homeroom
        </button>
      </div>

      {warning && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <span>{warning}</span>
          <button type="button" onClick={() => setWarning(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-primary/25 bg-primary-subtle px-3 py-2 text-sm text-primary-active">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Grade</th>
                <th className="px-4 py-3 font-semibold">Room</th>
                <th className="px-4 py-3 font-semibold">Seats</th>
                <th className="px-4 py-3 font-semibold">Class Teacher</th>
                <th className="px-4 py-3 font-semibold">Additional</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <EmptyRow>Loading homerooms...</EmptyRow>
              ) : loadError ? (
                <EmptyRow tone="danger">{loadError}</EmptyRow>
              ) : classrooms.length === 0 ? (
                <EmptyRow>
                  {search
                    ? `No homerooms match "${search}".`
                    : "No homerooms yet. Add the first one."}
                </EmptyRow>
              ) : (
                classrooms.map((room) => (
                  <tr
                    key={room.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {room.name}
                      </div>
                      {!room.isActive && (
                        <div className="mt-1">
                          <Badge tone="neutral">Not in use</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{room.gradeLabel}</td>
                    <td className="px-4 py-3 text-muted">
                      {room.roomNumber ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {/* Over-capacity is allowed but must be visible - see the
                          note on Classroom.capacity. */}
                      <span
                        className={
                          room.isOverCapacity
                            ? "font-semibold text-danger"
                            : "font-semibold text-primary"
                        }
                      >
                        {room.usedSeats}
                      </span>
                      <span className="text-muted"> / {room.capacity}</span>
                    </td>
                    <td className="px-4 py-3">
                      {room.classTeacher ? (
                        <span className="text-foreground">
                          {room.classTeacher.name}
                        </span>
                      ) : (
                        <span className="text-warning">Not assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {room.additionalTeachers.length === 0 ? (
                        <span className="text-muted">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {room.additionalTeachers.map((teacher) => (
                            <Badge key={teacher.teacherId} tone="neutral">
                              {teacher.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(room)}
                          aria-label={`View students in ${room.name}`}
                          title="View students"
                          className="rounded-control p-2 text-primary transition-colors hover:bg-primary-subtle"
                        >
                          <Users size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(room);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${room.name}`}
                          className="rounded-control p-2 text-warning transition-colors hover:bg-warning/10"
                        >
                          <Pencil size={16} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleting(room)}
                            aria-label={`Delete ${room.name}`}
                            className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
            <span>
              Showing {(pagination.page - 1) * pagination.perPage + 1} to{" "}
              {Math.min(pagination.page * pagination.perPage, pagination.total)}{" "}
              of {pagination.total} entries
            </span>
            <div className="flex gap-2">
              <PageButton
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </PageButton>
              <PageButton
                disabled={pagination.page >= pagination.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </PageButton>
            </div>
          </div>
        )}
      </div>

      {/* Keyed per room and mounted only while open, so each open is a fresh
          mount that seeds its roster rows from props. */}
      {formOpen && (
        <ClassroomForm
          key={editing?.id ?? "new"}
          classroom={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={afterSave}
        />
      )}

      {viewing && (
        <RosterModal
          key={viewing.id}
          classroom={viewing}
          canAssign={canAssign}
          onClose={() => setViewing(null)}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete homeroom"
        description="This removes the classroom record."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Delete <strong>{deleting?.name}</strong>? This cannot be undone. To
          keep the record but take the room out of service, edit it and untick
          &ldquo;Room in use&rdquo; instead.
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="rounded-control bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover"
          >
            Delete
          </button>
        </div>
      </Modal>
    </>
  );
}

function EmptyRow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <tr>
      <td
        colSpan={7}
        className={`px-4 py-10 text-center text-sm ${
          tone === "danger" ? "text-danger" : "text-muted"
        }`}
      >
        {children}
      </td>
    </tr>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
