"use client";

import { useMemo, useState } from "react";
import { HeartPulse, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  queryKeys,
  useClassroomPickerQuery,
  useClinicalVisitsQuery,
  useInvalidate,
} from "@/hooks/queries";
import { useDismissibleError } from "@/hooks/useDismissibleError";
import type { ClinicalVisitRow, VisitSummary } from "@/lib/clinicalVisits";
import {
  VISIT_OUTCOME,
  VISIT_OUTCOME_LABEL,
  type VisitOutcome,
} from "@/models/enums";
import { formatVisitedAt } from "./formatVisitedAt";
import { StudentHealthModal } from "./StudentHealthModal";
import { VisitModal } from "./VisitModal";

/**
 * The clinical-visit log.
 *
 * Note what is NOT here: any branch on the caller's role. The API scopes every
 * read, so a guardian hitting this same screen simply gets fewer rows. The two
 * `can*` props only decide which buttons are drawn.
 */

/** How serious the outcome was, as a badge tone. */
const OUTCOME_TONE: Record<VisitOutcome, "success" | "warning" | "danger"> = {
  RETURN_TO_CLASS: "success",
  SENT_HOME: "warning",
  NURSERY_CLINIC: "warning",
  AMBULANCE_TO_HOSPITAL: "danger",
};

const EMPTY_SUMMARY: VisitSummary = {
  total: 0,
  children: 0,
  sentHome: 0,
  escalated: 0,
};

export function HealthReportsClient({
  canRecord,
  canDelete,
}: {
  canRecord: boolean;
  canDelete: boolean;
}) {
  const [search, setSearch] = useState("");
  const [classroom, setClassroom] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<ClinicalVisitRow | null>(null);
  const [viewingStudent, setViewingStudent] = useState<
    ClinicalVisitRow["student"] | null
  >(null);
  const [deleting, setDeleting] = useState<ClinicalVisitRow | null>(null);

  const invalidate = useInvalidate();

  // The classroom picker. Guardians get no rooms back and simply see no filter.
  const classrooms = useClassroomPickerQuery().data?.classrooms ?? [];

  // The two date boxes are the only controls that can be typed into; the
  // dropdowns change once per click and go straight through.
  const debouncedFrom = useDebouncedValue(from, 300);
  const debouncedTo = useDebouncedValue(to, 300);
  const records = useClinicalVisitsQuery(
    classroom,
    outcome,
    debouncedFrom,
    debouncedTo,
  );
  const { data, isPending } = records;

  // Memoised so the identity is stable between renders - it feeds the name
  // filter below, which would otherwise recompute on every one.
  const visits = useMemo(() => data?.visits ?? [], [data]);
  const summary = data?.summary ?? EMPTY_SUMMARY;

  // A failed delete and a failed load share the one dismissible line, the
  // delete first because it is the thing that just happened.
  const [banner, dismissBanner] = useDismissibleError(
    records,
    "Could not load the health records.",
  );
  const loadError = deleteError ?? banner;

  function dismissError() {
    setDeleteError(null);
    dismissBanner();
  }

  /*
   * The name search runs here rather than as a query param: the child's name
   * lives on Student, not on the visit, so filtering it server-side would mean
   * a join on every keystroke to narrow a list already in the browser.
   */
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return visits;
    return visits.filter((v) =>
      v.student.fullName.toLowerCase().includes(term),
    );
  }, [visits, search]);

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/clinical-visits/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleteError(payload.error ?? "Could not remove the visit.");
    } else {
      setDeleteError(null);
      setNotice("Visit removed.");
    }
    setDeleting(null);
    invalidate(queryKeys.clinicalVisits.all);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a child"
            aria-label="Search a child"
            className="w-full rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>

        {classrooms.length > 0 && (
          <select
            value={classroom}
            onChange={(event) => setClassroom(event.target.value)}
            aria-label="Classroom"
            className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          >
            <option value="">All classrooms</option>
            {classrooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          aria-label="Outcome"
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          <option value="">All outcomes</option>
          {Object.values(VISIT_OUTCOME).map((value) => (
            <option key={value} value={value}>
              {VISIT_OUTCOME_LABEL[value]}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From"
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To"
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />

        {canRecord && (
          <button
            type="button"
            onClick={() => setRecording(true)}
            className="flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Plus size={16} />
            Record a visit
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">
          <span>{loadError}</span>
          <button type="button" onClick={dismissError} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-primary/25 bg-primary-subtle px-3 py-2 text-sm text-primary-active">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Visits" value={summary.total} />
        <Tile label="Children seen" value={summary.children} />
        <Tile label="Sent home" value={summary.sentHome} />
        <Tile label="Clinic or hospital" value={summary.escalated} />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Child</th>
                <th className="px-4 py-3 font-semibold">Seen</th>
                <th className="px-4 py-3 font-semibold">Symptoms</th>
                <th className="px-4 py-3 font-semibold">Care</th>
                <th className="px-4 py-3 font-semibold">Outcome</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <EmptyRow>Loading the health records...</EmptyRow>
              ) : shown.length === 0 ? (
                <EmptyRow>
                  {search
                    ? "No visits for that child."
                    : canRecord
                      ? "No visits recorded yet. Record the first one."
                      : "No clinical visits have been recorded."}
                </EmptyRow>
              ) : (
                shown.map((visit) => (
                  <tr
                    key={visit.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewingStudent(visit.student)}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {visit.student.fullName}
                      </button>
                      <div className="text-xs text-muted">
                        {visit.classroom?.name ?? visit.student.nationality ?? ""}
                      </div>
                      {visit.student.medicalNotes && (
                        <div className="mt-1">
                          <Badge tone="warning">Medical note</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatVisitedAt(visit.visitedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <LabelList labels={symptomLabels(visit)} />
                    </td>
                    <td className="px-4 py-3">
                      <LabelList labels={visit.nursingCareLabels} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={OUTCOME_TONE[visit.outcome]}>
                        {visit.outcomeLabel}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingStudent(visit.student)}
                          aria-label={`Health record for ${visit.student.fullName}`}
                          className="rounded-control p-2 text-primary transition-colors hover:bg-primary-subtle"
                        >
                          <HeartPulse size={16} />
                        </button>
                        {canRecord && (
                          <button
                            type="button"
                            onClick={() => setEditing(visit)}
                            aria-label="Edit visit"
                            className="rounded-control p-2 text-warning transition-colors hover:bg-warning/10"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleting(visit)}
                            aria-label="Remove visit"
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
      </div>

      {(recording || editing) && (
        <VisitModal
          key={editing?.id ?? "new"}
          visit={editing}
          classrooms={classrooms}
          onClose={() => {
            setRecording(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setRecording(false);
            setEditing(null);
            setNotice(message);
            invalidate(queryKeys.clinicalVisits.all);
          }}
        />
      )}

      {viewingStudent && (
        <StudentHealthModal
          student={viewingStudent}
          onClose={() => setViewingStudent(null)}
        />
      )}

      <Modal
        open={deleting !== null}
        title="Remove this visit?"
        description="The clinical record is deleted for good. This cannot be undone."
        onClose={() => setDeleting(null)}
      >
        <div className="px-6 py-5 text-sm text-muted">
          {deleting && (
            <p>
              {deleting.student.fullName}, seen{" "}
              {formatVisitedAt(deleting.visitedAt)} - {deleting.outcomeLabel}.
            </p>
          )}
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
            onClick={() => void confirmDelete()}
            className="rounded-control bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover"
          >
            Remove visit
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Every symptom on one visit, free text included, for the table's cell. */
function symptomLabels(visit: ClinicalVisitRow): string[] {
  return [
    ...visit.fluSymptomLabels,
    ...visit.otherSymptomLabels,
    ...visit.additionalSymptomLabels,
    ...(visit.fluSymptomsOther ? [visit.fluSymptomsOther] : []),
    ...(visit.additionalSymptomsOther ? [visit.additionalSymptomsOther] : []),
  ];
}

/** Up to three labels, then a count - a bad day should not blow up the row. */
function LabelList({ labels }: { labels: string[] }) {
  if (labels.length === 0) return <span className="text-subtle">-</span>;
  const shown = labels.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((label) => (
        <span
          key={label}
          className="inline-flex rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted"
        >
          {label}
        </span>
      ))}
      {labels.length > shown.length && (
        <span className="text-xs text-subtle">
          +{labels.length - shown.length}
        </span>
      )}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
