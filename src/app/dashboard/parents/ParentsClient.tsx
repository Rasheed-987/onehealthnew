"use client";

import { useState } from "react";
import { Mail, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Notice } from "@/components/dashboard/Notice";
import { Pagination } from "@/components/dashboard/Pagination";
import { SearchInput } from "@/components/dashboard/SearchInput";
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search parents by name, email or phone..."
          aria-label="Search parents"
        />
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          Add Parent
        </Button>
      </div>

      {warning && (
        <Notice tone="danger" onDismiss={() => setWarning(null)}>
          {warning}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted hover:bg-surface-muted">
                <TableHead className="px-5 py-3.5">Parent</TableHead>
                <TableHead className="px-4 py-3.5">Contact</TableHead>
                <TableHead className="px-4 py-3.5">Children</TableHead>
                <TableHead className="px-4 py-3.5">Occupation</TableHead>
                <TableHead className="px-4 py-3.5">Status</TableHead>
                <TableHead className="px-5 py-3.5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                  <TableRow key={parent.id} className="text-xs">
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-subtle text-warning font-bold text-xs">
                          {parent.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">
                            {parent.fullName}
                          </div>
                          {parent.address && (
                            <div className="text-[11px] text-subtle">{parent.address}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="text-foreground">{parent.email}</div>
                      {parent.phone && (
                        <div className="text-xs text-muted">{parent.phone}</div>
                      )}
                      {parent.emergencyPhone && (
                        <div className="text-xs text-muted">
                          Emergency: {parent.emergencyPhone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
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
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted">
                      {parent.occupation ?? "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        tone={
                          STATUS_TONE[parent.status as keyof typeof STATUS_TONE] ??
                          "neutral"
                        }
                      >
                        {STATUS_LABEL[parent.status as keyof typeof STATUS_LABEL] ??
                          parent.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(parent);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${parent.fullName}`}
                          className="text-warning hover:bg-warning/10 hover:text-warning"
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setResending(parent)}
                          aria-label={`Send an email to ${parent.fullName}`}
                          title={
                            parent.status === USER_STATUS.INVITED
                              ? "Resend invitation"
                              : "Send password reset"
                          }
                          className="text-muted"
                        >
                          <Mail size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(parent)}
                          aria-label={`Delete ${parent.fullName}`}
                          className="text-danger hover:bg-danger-subtle hover:text-danger"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination pagination={pagination} onPageChange={setPage} />
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
        title="Delete parent"
        description="This removes the guardian profile and the sign-in account."
      >
        Delete <strong>{deleting?.fullName}</strong>? This cannot be undone. To
        keep the record but block sign-in, edit the parent and set their status
        to suspended instead.
      </ConfirmDialog>
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
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={6}
        className={`px-4 py-10 text-center text-sm ${
          tone === "danger" ? "text-danger" : "text-muted"
        }`}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
