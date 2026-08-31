"use client";

import { useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Notice } from "@/components/dashboard/Notice";
import { Pagination } from "@/components/dashboard/Pagination";
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
  GUARDIAN_RELATIONSHIP,
  GUARDIAN_RELATIONSHIP_LABEL,
} from "@/models/enums";

const TABS = [
  { value: GUARDIAN_LINK_STATUS.PENDING, label: "Awaiting review" },
  { value: GUARDIAN_LINK_STATUS.APPROVED, label: "Approved" },
  { value: GUARDIAN_LINK_STATUS.REJECTED, label: "Rejected" },
] as const;

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
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-card border border-success/30 bg-success-subtle p-4 text-xs font-bold leading-relaxed text-success-strong">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        <span>
          Approving a request gives the guardian live access to attendance,
          progress sheets, health records and messaging for that child.
        </span>
      </div>

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {warning && (
        <Notice tone="danger" onDismiss={() => setWarning(null)}>
          {warning}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {isPending ? (
        <div className="py-12 text-center text-xs font-semibold text-subtle">
          Loading requests...
        </div>
      ) : loadError ? (
        <div className="py-12 text-center text-xs font-bold text-danger">
          {loadError}
        </div>
      ) : requests.length === 0 ? (
        <div className="card-soft border-dashed p-12 text-center">
          <p className="text-sm font-bold text-foreground">No link requests</p>
          <p className="mt-1 text-xs text-subtle">
            {status === GUARDIAN_LINK_STATUS.PENDING
              ? "Nothing waiting. Guardians who sign up in the app appear here."
              : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="card-soft">
              <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-foreground">
                    <span>{request.parent.name}</span>
                    <span className="font-normal text-subtle">→</span>
                    <span className="text-primary">
                      {request.student
                        ? request.student.fullName
                        : "Deleted child"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-muted">
                    <span className="capitalize">
                      {GUARDIAN_RELATIONSHIP_LABEL[
                        request.relationship as keyof typeof GUARDIAN_RELATIONSHIP_LABEL
                      ] ?? request.relationship}
                    </span>
                    <span className="text-subtle">•</span>
                    <span>submitted {formatDate(request.requestedAt)}</span>
                  </div>
                  {request.note && (
                    <p className="mt-1 max-w-xl rounded-lg border border-border bg-surface-muted p-2 text-xs italic text-subtle">
                      Reason: {request.note}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {request.status === GUARDIAN_LINK_STATUS.PENDING ? (
                    <>
                      <Badge tone="warning">Pending</Badge>

                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === request.id || !request.student}
                        onClick={() => {
                          setRelationship(
                            request.relationship ||
                              GUARDIAN_RELATIONSHIP.GUARDIAN,
                          );
                          setApproving(request);
                        }}
                      >
                        <Check size={14} />
                        Approve
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyId === request.id}
                        onClick={() => {
                          setNote("");
                          setRejecting(request);
                        }}
                      >
                        <X size={14} />
                        Reject
                      </Button>
                    </>
                  ) : request.status === GUARDIAN_LINK_STATUS.APPROVED ? (
                    <Badge tone="success">Approved</Badge>
                  ) : (
                    <Badge tone="danger">Rejected</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} />

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title="Approve link request"
        description="This gives the guardian access to the child's records."
      >
        <div className="space-y-4 px-6 py-5 text-sm text-foreground">
          <p>
            Give <strong>{approving?.parent.name}</strong> access to{" "}
            <strong>{approving?.student?.fullName}</strong>?
          </p>
          <p className="text-muted">
            They will be able to see this child&apos;s daily sheets, attendance,
            health records, photos and message threads. Only approve this if you
            know they are this child&apos;s guardian.
          </p>

          <div className="space-y-1.5">
            <Label>Relationship</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {GUARDIAN_RELATIONSHIP_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-xs text-muted">
              The app does not ask for this, so set it here. It is what contact
              cards and pickup lists show.
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => setApproving(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              const target = approving;
              setApproving(null);
              if (target) void decide(target, "approve", { relationship });
            }}
          >
            Approve and link
          </Button>
        </div>
      </Modal>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject link request"
        description="Nothing is written to the child's record."
      >
        <div className="space-y-4 px-6 py-5 text-sm text-foreground">
          <p>
            Reject <strong>{rejecting?.parent.name}</strong>&apos;s request for{" "}
            <strong>{rejecting?.student?.fullName ?? "this child"}</strong>? Their
            account stays, but they get no access.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Reason (optional)</Label>
            <Input
              id="reject-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Kept on the record for the school only"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => setRejecting(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              const target = rejecting;
              setRejecting(null);
              if (target) {
                void decide(target, "reject", note ? { note } : {});
              }
            }}
          >
            Reject
          </Button>
        </div>
      </Modal>
    </div>
  );
}
