"use client";

import { useState } from "react";
import { Mail, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ParentForm } from "./ParentForm";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useInvalidate,
  useParentsQuery,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { ParentRow } from "@/lib/parents";
import { GUARDIAN_RELATIONSHIP, USER_STATUS } from "@/models/enums";

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

const RELATIONSHIP_LABEL: Record<string, string> = {
  [GUARDIAN_RELATIONSHIP.MOTHER]: "Mother",
  [GUARDIAN_RELATIONSHIP.FATHER]: "Father",
  [GUARDIAN_RELATIONSHIP.GUARDIAN]: "Guardian",
  [GUARDIAN_RELATIONSHIP.OTHER]: "Other",
};

export function ParentsClient() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ParentRow | null>(null);
  const [deleting, setDeleting] = useState<ParentRow | null>(null);
  const [resending, setResending] = useState<ParentRow | null>(null);

  const invalidate = useInvalidate();

  // Debounced: typing should not fire a request per keystroke. Paging is not -
  // a page already fetched comes straight back from the cache.
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isPending, isError, error } = useParentsQuery(
    debouncedSearch,
    page,
  );

  const parents = data?.parents ?? [];
  const pagination = data?.pagination ?? EMPTY_PAGINATION;
  const loadError = isError ? errorMessage(error, "Could not load parents.") : null;

  function afterSave(result: { message: string; warning?: string }) {
    setFormOpen(false);
    setEditing(null);
    setNotice(result.message);
    setWarning(result.warning ?? null);
    // Children carry their guardians on the row, so the student list is stale
    // the moment a guardian is renamed.
    invalidate(queryKeys.parents.all, queryKeys.students.all);
  }

  async function confirmResend() {
    if (!resending) return;
    const target = resending;
    setResending(null);
    setWarning(null);
    const response = await fetch(`/api/parents/${target.id}/invite`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWarning(payload.error ?? "Could not send the email.");
      return;
    }
    setNotice(`A ${payload.kind} email was sent to ${payload.email}.`);
    invalidate(queryKeys.parents.all);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/parents/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The 409 for "still a guardian" names the children; show them rather
      // than a bare failure.
      const children = payload.details?.children as string[] | undefined;
      setWarning(
        children?.length
          ? `${payload.error} (${children.join(", ")})`
          : (payload.error ?? "Could not delete parent."),
      );
    } else {
      setNotice(`${deleting.fullName} was deleted.`);
    }
    setDeleting(null);
    invalidate(queryKeys.parents.all, queryKeys.students.all);
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
            placeholder="Search by name, email or occupation"
            aria-label="Search parents"
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
          Add Parent
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
                <th className="px-4 py-3 font-semibold">Parent</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Children</th>
                <th className="px-4 py-3 font-semibold">Occupation</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <EmptyRow>Loading parents...</EmptyRow>
              ) : loadError ? (
                <EmptyRow tone="danger">{loadError}</EmptyRow>
              ) : parents.length === 0 ? (
                <EmptyRow>
                  {search
                    ? `No parents match "${search}".`
                    : "No parents yet. Add the first one."}
                </EmptyRow>
              ) : (
                parents.map((parent) => (
                  <tr
                    key={parent.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {parent.fullName}
                      </div>
                      {parent.address && (
                        <div className="text-xs text-muted">{parent.address}</div>
                      )}
                      {parent.status === USER_STATUS.INVITED && (
                        <div className="mt-1">
                          <Badge tone="warning">Invitation pending</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{parent.email}</div>
                      {parent.phone && (
                        <div className="text-xs text-muted">{parent.phone}</div>
                      )}
                      {parent.emergencyPhone && (
                        <div className="text-xs text-muted">
                          Emergency: {parent.emergencyPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {parent.children.length === 0 ? (
                        <span className="text-muted">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {parent.children.map((child) => (
                            <Badge key={child.id} tone="neutral">
                              {child.name} (
                              {RELATIONSHIP_LABEL[child.relationship] ??
                                child.relationship}
                              )
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {parent.occupation ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          STATUS_TONE[parent.status as keyof typeof STATUS_TONE] ??
                          "neutral"
                        }
                      >
                        {STATUS_LABEL[parent.status as keyof typeof STATUS_LABEL] ??
                          parent.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(parent);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${parent.fullName}`}
                          className="rounded-control p-2 text-warning transition-colors hover:bg-warning/10"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResending(parent)}
                          aria-label={`Send an email to ${parent.fullName}`}
                          title={
                            parent.status === USER_STATUS.INVITED
                              ? "Resend invitation"
                              : "Send password reset"
                          }
                          className="rounded-control p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                        >
                          <Mail size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(parent)}
                          aria-label={`Delete ${parent.fullName}`}
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

      <ParentForm
        open={formOpen}
        parent={editing}
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
              Email a password reset link to <strong>{resending?.email}</strong>?
              Their current password keeps working until they use it.
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
        title="Delete parent"
        description="This removes the guardian profile and the sign-in account."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Delete <strong>{deleting?.fullName}</strong>? This cannot be undone.
          To keep the record but block sign-in, edit the parent and set their
          status to suspended instead.
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
