"use client";

import { useState } from "react";
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Notice } from "@/components/dashboard/Notice";
import { Pagination } from "@/components/dashboard/Pagination";
import { SearchInput } from "@/components/dashboard/SearchInput";
import { TeacherForm } from "./TeacherForm";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useInvalidate,
  useTeachersQuery,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { TeacherRow } from "@/lib/teachers";
import { USER_STATUS } from "@/models/enums";

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [deleting, setDeleting] = useState<TeacherRow | null>(null);
  const [resending, setResending] = useState<TeacherRow | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const invalidate = useInvalidate();

  // Debounced: typing in the search box should not fire a request per
  // keystroke. Paging is not debounced - a page already fetched is a cache hit.
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isPending, isError, error } = useTeachersQuery(
    debouncedSearch,
    page,
  );

  const teachers = data?.teachers ?? [];
  const pagination = data?.pagination ?? EMPTY_PAGINATION;
  const loadError = isError ? errorMessage(error, "Could not load teachers.") : null;

  function afterSave(result: { message: string; warning?: string }) {
    setFormOpen(false);
    setEditing(null);
    setNotice(result.message);
    setWarning(result.warning ?? null);
    // Homerooms name their teachers, so their rows and the teacher picker on
    // the homeroom form both go stale with this.
    invalidate(queryKeys.teachers.all, queryKeys.classrooms.all);
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
    invalidate(queryKeys.teachers.all);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/teachers/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The 409 for "still assigned to a classroom" names the classrooms; show them
      // rather than a bare failure.
      const classrooms = payload.details?.classrooms as string[] | undefined;
      setNotice(
        classrooms?.length
          ? `${payload.error} (${classrooms.join(", ")})`
          : (payload.error ?? "Could not delete teacher."),
      );
    } else {
      setNotice(`${deleting.displayName} was deleted.`);
    }
    setDeleting(null);
    invalidate(queryKeys.teachers.all, queryKeys.classrooms.all);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search teachers by name, email or ID..."
          aria-label="Search teachers"
        />
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          Add Teacher
        </Button>
      </div>

      {warning && (
        <Notice tone="danger" onDismiss={() => setWarning(null)}>
          {warning}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {/* Modern Teacher Cards Grid */}
      {isPending ? (
        <div className="py-12 text-center text-xs font-semibold text-subtle">
          Loading teachers...
        </div>
      ) : loadError ? (
        <div className="py-12 text-center text-xs font-bold text-danger">
          {loadError}
        </div>
      ) : teachers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-12 text-center">
          <p className="text-sm font-bold text-foreground">No teachers found</p>
          <p className="mt-1 text-xs text-subtle">
            {search
              ? `No teachers match "${search}".`
              : "No teachers yet. Add the first one."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((teacher, index) => {
            const avatarColors = [
              "bg-primary/10 text-primary",
              "bg-crayon-blue/10 text-crayon-blue",
              "bg-crayon-purple/10 text-crayon-purple",
              "bg-warning/10 text-warning",
            ];
            const colorClass = avatarColors[index % avatarColors.length];

            return (
              <div
                key={teacher.id}
                className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-card"
              >
                <div>
                  {/* Top info and status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold text-sm ${colorClass}`}>
                        {teacher.displayName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-foreground leading-snug">
                          {teacher.displayName}
                        </h3>
                        <p className="text-[11px] font-bold text-subtle mt-0.5">
                          {teacher.specialization ?? "Early Ed Faculty"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 items-end">
                      {teacher.status && (
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
                      )}
                      {teacher.employeeId && (
                        <span className="text-[10px] font-extrabold text-muted tracking-wider uppercase bg-surface-muted border border-border rounded-md px-1.5 py-0.5 mt-1">
                          ID: {teacher.employeeId}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Mail size={14} className="text-subtle" />
                      <span className="truncate">{teacher.email}</span>
                    </div>
                    {teacher.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Phone size={14} className="text-subtle" />
                        <span>{teacher.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Classrooms List */}
                  <div className="mt-5 pt-4 border-t border-surface-muted">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-subtle block mb-2">
                      Classroom Assignments
                    </span>

                    {teacher.classrooms.length === 0 ? (
                      <span className="text-xs text-subtle italic">No classrooms assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {teacher.classrooms.map((room) => (
                          <span
                            key={room.id}
                            className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold ${
                              room.role === "LEAD"
                                ? "bg-success-subtle text-primary"
                                : "bg-surface-muted border border-border text-muted"
                            }`}
                          >
                            {room.name} {room.role === "LEAD" ? " (Lead)" : " (Assist)"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResending(teacher)}
                    className="flex-1"
                  >
                    <Mail size={14} className="text-subtle" />
                    <span>
                      {teacher.status === USER_STATUS.INVITED
                        ? "Resend Invite"
                        : "Reset Access"}
                    </span>
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(teacher);
                        setFormOpen(true);
                      }}
                      title="Edit Profile"
                      aria-label={`Edit ${teacher.displayName}`}
                      className="text-subtle"
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(teacher)}
                      title="Delete Teacher"
                      aria-label={`Delete ${teacher.displayName}`}
                      className="text-subtle hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Pagination pagination={pagination} onPageChange={setPage} />
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

      <ConfirmDialog
        open={resending !== null}
        onClose={() => setResending(null)}
        onConfirm={confirmResend}
        confirmLabel="Send email"
        title={
          resending?.status === USER_STATUS.INVITED
            ? "Resend invitation"
            : "Send password reset"
        }
        description="Emails a fresh single-use link."
      >
        {resending?.status === USER_STATUS.INVITED ? (
          <>
            Send a new invitation to <strong>{resending?.email}</strong>? Any
            previous invitation link stops working.
          </>
        ) : (
          <>
            Email a password reset link to <strong>{resending?.email}</strong>?
            Their current password keeps working until they use it.
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
        destructive
        title="Delete teacher"
        description="This removes the staff profile and the sign-in account."
      >
        Delete <strong>{deleting?.displayName}</strong>? This cannot be undone.
        To keep the record but block sign-in, edit the teacher and untick
        &ldquo;Active&rdquo; instead.
      </ConfirmDialog>
    </>
  );
}
