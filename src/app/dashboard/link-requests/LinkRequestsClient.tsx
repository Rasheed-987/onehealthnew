"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useGuardianLinkRequestsQuery,
  useInvalidate,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { GuardianLinkRequestRow } from "@/lib/guardianLinks";
import {
  GUARDIAN_LINK_STATUS,
  GUARDIAN_LINK_STATUS_LABEL,
  GUARDIAN_RELATIONSHIP,
  GUARDIAN_RELATIONSHIP_LABEL,
} from "@/models/enums";

const TABS = [
  { value: GUARDIAN_LINK_STATUS.PENDING, label: "Awaiting review" },
  { value: GUARDIAN_LINK_STATUS.APPROVED, label: "Approved" },
  { value: GUARDIAN_LINK_STATUS.REJECTED, label: "Rejected" },
] as const;

const STATUS_TONE = {
  [GUARDIAN_LINK_STATUS.PENDING]: "warning",
  [GUARDIAN_LINK_STATUS.APPROVED]: "success",
  [GUARDIAN_LINK_STATUS.REJECTED]: "danger",
  [GUARDIAN_LINK_STATUS.CANCELLED]: "neutral",
} as const;

const RELATIONSHIP_OPTIONS = Object.values(GUARDIAN_RELATIONSHIP);

/** "3 September 2026" - a queue is read by date, not by timestamp. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LinkRequestsClient() {
  const [status, setStatus] = useState<string>(GUARDIAN_LINK_STATUS.PENDING);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [approving, setApproving] = useState<GuardianLinkRequestRow | null>(
    null,
  );
  const [relationship, setRelationship] = useState<string>(
    GUARDIAN_RELATIONSHIP.GUARDIAN,
  );
  const [rejecting, setRejecting] = useState<GuardianLinkRequestRow | null>(
    null,
  );
  const [note, setNote] = useState("");

  const invalidate = useInvalidate();
  const { data, isPending, isError, error } = useGuardianLinkRequestsQuery(
    status,
    page,
  );

  const requests = data?.requests ?? [];
  const pagination = data?.pagination ?? EMPTY_PAGINATION;
  const loadError = isError
    ? errorMessage(error, "Could not load link requests.")
    : null;

  async function decide(
    target: GuardianLinkRequestRow,
    action: "approve" | "reject",
    body: Record<string, unknown>,
  ) {
    setBusyId(target.id);
    setWarning(null);
    try {
      const response = await fetch(
        `/api/guardian-link-requests/${target.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload: { error?: string } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setWarning(payload.error ?? "Could not save that decision.");
        return;
      }

      setNotice(
        action === "approve"
          ? `${target.parent.name} can now see ${target.student?.fullName ?? "this child"}.`
          : `${target.parent.name}'s request was rejected.`,
      );
      /*
       * The student rows carry their guardians, and the parents table carries
       * its children, so an approval makes both stale - name what changed, not
       * which queries to refetch.
       */
      invalidate(
        queryKeys.guardianLinkRequests.all,
        queryKeys.students.all,
        queryKeys.parents.all,
      );
    } catch {
      setWarning("Could not reach the server. Check your connection.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
              status === tab.value
                ? "bg-primary text-primary-foreground"
                : "border border-border-strong bg-surface text-foreground hover:bg-surface-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {warning && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <span>{warning}</span>
          <button
            type="button"
            onClick={() => setWarning(null)}
            aria-label="Dismiss"
          >
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
                <th className="px-4 py-3 font-semibold">Guardian</th>
                <th className="px-4 py-3 font-semibold">Child requested</th>
                <th className="px-4 py-3 font-semibold">Submitted</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <EmptyRow>Loading requests...</EmptyRow>
              ) : loadError ? (
                <EmptyRow tone="danger">{loadError}</EmptyRow>
              ) : requests.length === 0 ? (
                <EmptyRow>
                  {status === GUARDIAN_LINK_STATUS.PENDING
                    ? "Nothing waiting. Guardians who sign up in the app appear here."
                    : "Nothing here yet."}
                </EmptyRow>
              ) : (
                requests.map((request) => (
                  <tr
                    key={request.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {request.parent.name}
                      </div>
                      <div className="text-xs text-muted">
                        {request.parent.email}
                      </div>
                      {request.parent.phone && (
                        <div className="text-xs text-muted">
                          {request.parent.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {request.student ? (
                        <>
                          <div className="font-medium text-foreground">
                            {request.student.fullName}
                          </div>
                          <div className="font-mono text-xs text-muted">
                            {request.student.studentId}
                          </div>
                          <div className="mt-1">
                            {request.student.classroom ? (
                              <Badge tone="neutral">
                                {request.student.classroom}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted">
                                Not in a room yet
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        /* The child was deleted after the request was filed.
                           Shown rather than hidden: an approval would fail, and
                           staff need to see why. */
                        <span className="inline-flex items-center gap-1.5 text-danger">
                          <AlertTriangle size={14} />
                          Child no longer on the system
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <div>{formatDate(request.requestedAt)}</div>
                      {request.status !== GUARDIAN_LINK_STATUS.PENDING && (
                        <div className="mt-1">
                          <Badge tone={STATUS_TONE[request.status]}>
                            {GUARDIAN_LINK_STATUS_LABEL[request.status]}
                          </Badge>
                        </div>
                      )}
                      {request.note && (
                        <div className="mt-1 text-xs italic">
                          {request.note}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {request.status === GUARDIAN_LINK_STATUS.PENDING ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId === request.id || !request.student}
                            onClick={() => {
                              setRelationship(
                                request.relationship ||
                                  GUARDIAN_RELATIONSHIP.GUARDIAN,
                              );
                              setApproving(request);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Check size={14} />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === request.id}
                            onClick={() => {
                              setNote("");
                              setRejecting(request);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X size={14} />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-right text-xs text-muted">
                          {request.decidedAt
                            ? formatDate(request.decidedAt)
                            : "-"}
                        </div>
                      )}
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

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title="Approve link request"
        description="This gives the guardian access to the child's records."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          <p>
            Give <strong>{approving?.parent.name}</strong> access to{" "}
            <strong>{approving?.student?.fullName}</strong>?
          </p>
          <p className="mt-2 text-muted">
            They will be able to see this child&apos;s daily sheets, attendance,
            health records, photos and message threads. Only approve this if you
            know they are this child&apos;s guardian.
          </p>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-foreground">
              Relationship
            </span>
            <select
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            >
              {RELATIONSHIP_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {GUARDIAN_RELATIONSHIP_LABEL[value]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              The app does not ask for this, so set it here. It is what contact
              cards and pickup lists show.
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setApproving(null)}
            className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const target = approving;
              setApproving(null);
              if (target) void decide(target, "approve", { relationship });
            }}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Approve and link
          </button>
        </div>
      </Modal>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject link request"
        description="Nothing is written to the child's record."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          <p>
            Reject <strong>{rejecting?.parent.name}</strong>&apos;s request for{" "}
            <strong>
              {rejecting?.student?.fullName ?? "this child"}
            </strong>
            ? Their account stays, but they get no access.
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-foreground">
              Reason (optional)
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Kept on the record for the school only"
              className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setRejecting(null)}
            className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const target = rejecting;
              setRejecting(null);
              if (target) {
                void decide(target, "reject", note ? { note } : {});
              }
            }}
            className="rounded-control bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover"
          >
            Reject
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
        colSpan={4}
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
