"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { StudentForm } from "./StudentForm";
import type { StudentRow } from "@/lib/students";
import { GUARDIAN_RELATIONSHIP } from "@/models/enums";

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  [GUARDIAN_RELATIONSHIP.MOTHER]: "Mother",
  [GUARDIAN_RELATIONSHIP.FATHER]: "Father",
  [GUARDIAN_RELATIONSHIP.GUARDIAN]: "Guardian",
  [GUARDIAN_RELATIONSHIP.OTHER]: "Other",
};

export function StudentsClient({ canDelete }: { canDelete: boolean }) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    perPage: 20,
    total: 0,
    pageCount: 1,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);

  const load = useCallback(
    async (currentSearch: string, currentPage: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ page: String(currentPage) });
        if (currentSearch) params.set("search", currentSearch);
        const response = await fetch(`/api/students?${params}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setLoadError(payload.error ?? "Could not load students.");
          setStudents([]);
          return;
        }
        setStudents(payload.students);
        setPagination(payload.pagination);
      } catch {
        setLoadError("Could not reach the server.");
        setStudents([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(search, page), 300);
    return () => clearTimeout(timer);
  }, [search, page, load]);

  function afterSave(message: string) {
    setFormOpen(false);
    setEditing(null);
    setNotice(message);
    void load(search, page);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/students/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const room = payload.details?.classroom as string | undefined;
      setWarning(
        room ? `${payload.error} (${room})` : (payload.error ?? "Could not delete."),
      );
    } else {
      setNotice(`${deleting.fullName} was removed.`);
    }
    setDeleting(null);
    void load(search, page);
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
            placeholder="Search by name"
            aria-label="Search students"
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
          Add Student
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
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Child</th>
                <th className="px-4 py-3 font-semibold">Age</th>
                <th className="px-4 py-3 font-semibold">Guardians</th>
                <th className="px-4 py-3 font-semibold">Classroom</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow>Loading students...</EmptyRow>
              ) : loadError ? (
                <EmptyRow tone="danger">{loadError}</EmptyRow>
              ) : students.length === 0 ? (
                <EmptyRow>
                  {search
                    ? `No children match "${search}".`
                    : "No children yet. Add the first one."}
                </EmptyRow>
              ) : (
                students.map((student) => (
                  <tr
                    key={student.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {student.fullName}
                      </div>
                      <div className="text-xs text-muted">
                        {student.nationality ?? ""}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!student.isActive && (
                          <Badge tone="neutral">Not attending</Badge>
                        )}
                        {student.medicalNotes && (
                          <Badge tone="warning">Medical note</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {student.age} {student.age === 1 ? "year" : "years"}
                    </td>
                    <td className="px-4 py-3">
                      {student.guardians.length === 0 ? (
                        /* Loud on purpose: a child with no guardian appears on
                           no parent's dashboard and has no contactable adult. */
                        <span className="inline-flex items-center gap-1.5 text-danger">
                          <AlertTriangle size={14} />
                          No guardian
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {student.guardians.map((guardian) => (
                            <span key={guardian.parentId} className="text-xs">
                              <span className="text-foreground">
                                {guardian.name}
                              </span>
                              <span className="text-muted">
                                {" "}
                                (
                                {RELATIONSHIP_LABEL[guardian.relationship] ??
                                  guardian.relationship}
                                )
                                {guardian.phone ? ` - ${guardian.phone}` : ""}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {student.classroom ? (
                        <Badge tone="success">{student.classroom.name}</Badge>
                      ) : (
                        <span className="text-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(student);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${student.fullName}`}
                          className="rounded-control p-2 text-warning transition-colors hover:bg-warning/10"
                        >
                          <Pencil size={16} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleting(student)}
                            aria-label={`Delete ${student.fullName}`}
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
              {(pagination.page - 1) * pagination.perPage + 1}-
              {Math.min(pagination.page * pagination.perPage, pagination.total)}{" "}
              of {pagination.total}
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

      {/* Mounted only while open, and keyed per child: the form seeds its
          guardian rows from props on mount, so a fresh mount is what keeps
          them in step without an effect. */}
      {formOpen && (
        <StudentForm
          key={editing?.id ?? "new"}
          open
          student={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={afterSave}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove student"
        description="This deletes the child's record."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Remove <strong>{deleting?.fullName}</strong>? This cannot be undone.
          To keep the record but mark them as gone, edit the child and untick
          &ldquo;Currently attending&rdquo; instead.
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
            Remove
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
        colSpan={5}
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
