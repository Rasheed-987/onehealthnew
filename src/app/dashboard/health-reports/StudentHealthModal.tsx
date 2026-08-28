"use client";

import { AlertTriangle, HeartPulse } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStudentVisitsQuery } from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { ClinicalVisitRow } from "@/lib/clinicalVisits";
import { formatVisitedAt } from "./formatVisitedAt";

/**
 * One child's health record: who they are, anything the school was told to
 * watch for, and every visit in the caller's scope.
 *
 * Unlike the weekly-progress modal, this one does fetch. The table row carries
 * a single visit; the history is the whole point of this screen, and it is not
 * already in the browser.
 */

export function StudentHealthModal({
  student,
  onClose,
}: {
  student: ClinicalVisitRow["student"];
  onClose: () => void;
}) {
  const { data, isPending, isError, error: loadError } = useStudentVisitsQuery(
    student.id,
  );

  const visits = data?.visits ?? [];
  const loading = isPending;
  const error = isError
    ? errorMessage(loadError, "Could not load this health record.")
    : null;

  const initials = student.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  const latest = visits[0];

  return (
    <Modal
      open
      title="Health Record"
      description="Child visits & wellness."
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        <div className="flex items-center gap-4 rounded-card border border-border bg-surface-muted p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-sm font-semibold text-primary">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{student.fullName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              {student.nationality && <span>{student.nationality}</span>}
              {latest?.classroom && (
                <Badge tone="success">
                  {latest.classroom.name} - {latest.classroom.gradeLabel}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {student.medicalNotes && (
          <div className="flex items-start gap-2 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            <span>{student.medicalNotes}</span>
          </div>
        )}

        <div className="flex items-center justify-between rounded-card border border-border bg-surface p-4 shadow-card">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Health
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              Clinical Visits
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {latest
                ? `Last visit ${formatVisitedAt(latest.visitedAt)}`
                : "No visits recorded."}
            </p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <HeartPulse size={22} />
          </span>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Visit History
            </h3>
            <span className="text-xs text-muted">
              {visits.length === 1 ? "1 visit" : `${visits.length} visits`}
            </span>
          </div>

          {error && (
            <div className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          {loading ? (
            <p className="py-6 text-center text-sm text-muted">
              Loading the health record...
            </p>
          ) : (
            !error &&
            (visits.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                This child has not been seen by the nurse.
              </p>
            ) : (
              <ul className="space-y-3">
                {visits.map((visit) => (
                  <li
                    key={visit.id}
                    className="rounded-card border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {formatVisitedAt(visit.visitedAt)}
                      </p>
                      <Badge
                        tone={
                          visit.outcome === "RETURN_TO_CLASS"
                            ? "success"
                            : visit.outcome === "AMBULANCE_TO_HOSPITAL"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {visit.outcomeLabel}
                      </Badge>
                    </div>

                    <Detail
                      label="Symptoms"
                      values={[
                        ...visit.fluSymptomLabels,
                        ...visit.otherSymptomLabels,
                        ...visit.additionalSymptomLabels,
                        ...(visit.fluSymptomsOther
                          ? [visit.fluSymptomsOther]
                          : []),
                        ...(visit.additionalSymptomsOther
                          ? [visit.additionalSymptomsOther]
                          : []),
                      ]}
                    />
                    <Detail label="Care" values={visit.nursingCareLabels} />
                    {visit.careNotes && (
                      <p className="mt-2 text-sm text-muted">
                        {visit.careNotes}
                      </p>
                    )}
                    {visit.notes && (
                      <p className="mt-2 text-sm text-muted">{visit.notes}</p>
                    )}
                    {visit.recordedBy && (
                      <p className="mt-2 text-xs text-subtle">
                        Recorded by {visit.recordedBy.name}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ))
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

function Detail({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-sm text-foreground">{values.join(", ")}</span>
    </div>
  );
}
