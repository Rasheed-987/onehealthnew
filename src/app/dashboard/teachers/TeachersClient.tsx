"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { TeacherForm } from "./TeacherForm";
import type { TeacherRow } from "@/lib/teachers";
import { USER_STATUS } from "@/models/enums";

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
}

const STATUS_TONE = {
  [USER_STATUS.ACTIVE]: "success",
  [USER_STATUS.INVITED]: "warning",
  [USER_STATUS.SUSPENDED]: "danger",
} as const;

const STATUS_LABEL = {
  [USER_STATUS.ACTIVE]: "Active",
  [USER_STATUS.INVITED]: "Invited",
  [USER_STATUS.SUSPENDED]: "Suspended",
} as const;

export function TeachersClient() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
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

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [deleting, setDeleting] = useState<TeacherRow | null>(null);
  const [resending, setResending] = useState<TeacherRow | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(
    async (currentSearch: string, currentPage: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ page: String(currentPage) });
        if (currentSearch) params.set("search", currentSearch);
        const response = await fetch(`/api/teachers?${params}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setLoadError(payload.error ?? "Could not load teachers.");
          setTeachers([]);
          return;
        }
        setTeachers(payload.teachers);
        setPagination(payload.pagination);
      } catch {
        setLoadError("Could not reach the server.");
        setTeachers([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Debounced: typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(search, page), 300);
    return () => clearTimeout(timer);
  }, [search, page, load]);

  function afterSave(result: { message: string; warning?: string }) {
    setFormOpen(false);
    setEditing(null);
    setNotice(result.message);
    setWarning(result.warning ?? null);
    void load(search, page);
  }

  async function confirmResend() {
    if (!resending) return;
    const target = resending;
    setResending(null);
    setWarning(null);
    const response = await fetch(`/api/teachers/${target.id}/invite`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWarning(payload.error ?? "Could not send the email.");
      return;
    }
    setNotice(`A ${payload.kind} email was sent to ${payload.email}.`);
    void load(search, page);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/teachers/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The 409 for "still assigned to a classroom" names the rooms; show them
      // rather than a bare failure.
      const rooms = payload.details?.classrooms as string[] | undefined;
      setNotice(
        rooms?.length
          ? `${payload.error} (${rooms.join(", ")})`
          : (payload.error ?? "Could not delete teacher."),
      );
    } else {
      setNotice(`${deleting.displayName} was deleted.`);
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
            placeholder="Search by name, email or employee ID"
            aria-label="Search teachers"
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
          Add Teacher
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
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Teacher</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Employee ID</th>
                <th className="px-4 py-3 font-semibold">Classrooms</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow>Loading teachers...</EmptyRow>
              ) : loadError ? (
                <EmptyRow tone="danger">{loadError}</EmptyRow>
              ) : teachers.length === 0 ? (
                <EmptyRow>
                  {search
                    ? `No teachers match "${search}".`
                    : "No teachers yet. Add the first one."}
                </EmptyRow>
              ) : (
                teachers.map((teacher) => (
                  <tr
                    key={teacher.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {teacher.displayName}
                      </div>
                      {teacher.specialization && (
                        <div className="text-xs text-muted">
                          {teacher.specialization}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!teacher.isActive && (
                          <Badge tone="neutral">Inactive</Badge>
                        )}
                        {teacher.status === USER_STATUS.INVITED && (
                          <Badge tone="warning">Invitation pending</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{teacher.email}</div>
                      {teacher.phone && (
                        <div className="text-xs text-muted">
                          {teacher.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {teacher.employeeId ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {teacher.classrooms.length === 0 ? (
                        <span className="text-muted">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {teacher.classrooms.map((room) => (
                            <Badge
                              key={room.id}
                              tone={
                                room.role === "LEAD" ? "success" : "neutral"
                              }
                            >
                              {room.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          STATUS_TONE[
                            teacher.status as keyof typeof STATUS_TONE
                          ] ?? "neutral"
                        }
                      >
                        {STATUS_LABEL[
                          teacher.status as keyof typeof STATUS_LABEL
                        ] ?? teacher.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(teacher);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${teacher.displayName}`}
                          className="rounded-control p-2 text-warning transition-colors hover:bg-warning/10"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResending(teacher)}
                          aria-label={`Send an email to ${teacher.displayName}`}
                          title={
                            teacher.status === USER_STATUS.INVITED
                              ? "Resend invitation"
                              : "Send password reset"
                          }
                          className="rounded-control p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                        >
                          <Mail size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(teacher)}
                          aria-label={`Delete ${teacher.displayName}`}
                          className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
                        >
                          <Trash2 size={16} />
                        </button>
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

      <TeacherForm
        open={formOpen}
        teacher={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={afterSave}
      />

      <Modal
        open={resending !== null}
        onClose={() => setResending(null)}
        title={
          resending?.status === USER_STATUS.INVITED
            ? "Resend invitation"
            : "Send password reset"
        }
        description="Emails a fresh single-use link."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          {resending?.status === USER_STATUS.INVITED ? (
            <>
              Send a new invitation to <strong>{resending?.email}</strong>? Any
              previous invitation link stops working.
            </>
          ) : (
            <>
              Email a password reset link to <strong>{resending?.email}</strong>
              ? Their current password keeps working until they use it.
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setResending(null)}
            className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmResend}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Send email
          </button>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete teacher"
        description="This removes the staff profile and the sign-in account."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Delete <strong>{deleting?.displayName}</strong>? This cannot be
          undone. To keep the record but block sign-in, edit the teacher and
          untick &ldquo;Active&rdquo; instead.
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
        colSpan={6}
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
