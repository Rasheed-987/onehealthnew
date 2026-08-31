"use client";

import { useMemo, useState } from "react";
import { HeartPulse, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { SearchInput } from "@/components/dashboard/SearchInput";
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

const ALL = "__all__";

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
        <SearchInput
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search a child"
          aria-label="Search a child"
          className="min-w-[200px]"
        />

        {classrooms.length > 0 && (
          <Select
            value={classroom || ALL}
            onValueChange={(value) => setClassroom(value === ALL ? "" : value)}
          >
            <SelectTrigger className="w-auto" aria-label="Classroom">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classrooms</SelectItem>
              {classrooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={outcome || ALL}
          onValueChange={(value) => setOutcome(value === ALL ? "" : value)}
        >
          <SelectTrigger className="w-auto" aria-label="Outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All outcomes</SelectItem>
            {Object.values(VISIT_OUTCOME).map((value) => (
              <SelectItem key={value} value={value}>
                {VISIT_OUTCOME_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="From"
          className="w-auto"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          aria-label="To"
          className="w-auto"
        />

        {canRecord && (
          <Button type="button" onClick={() => setRecording(true)}>
            <Plus size={16} />
            Record a visit
          </Button>
        )}
      </div>

      {loadError && (
        <Notice tone="danger" onDismiss={dismissError}>
          {loadError}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Visits" value={summary.total} />
        <Tile label="Children seen" value={summary.children} />
        <Tile label="Sent home" value={summary.sentHome} />
        <Tile label="Clinic or hospital" value={summary.escalated} />
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                <TableHead className="px-4 py-3 font-semibold">Child</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Seen</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Symptoms</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Care</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Outcome</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                  <TableRow key={visit.id}>
                    <TableCell className="px-4 py-3">
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
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted">
                      {formatVisitedAt(visit.visitedAt)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <LabelList labels={symptomLabels(visit)} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <LabelList labels={visit.nursingCareLabels} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge tone={OUTCOME_TONE[visit.outcome]}>
                        {visit.outcomeLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewingStudent(visit.student)}
                          aria-label={`Health record for ${visit.student.fullName}`}
                          className="text-primary hover:bg-primary-subtle hover:text-primary"
                        >
                          <HeartPulse size={16} />
                        </Button>
                        {canRecord && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(visit)}
                            aria-label="Edit visit"
                            className="text-warning hover:bg-warning/10 hover:text-warning"
                          >
                            <Pencil size={16} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(visit)}
                            aria-label="Remove visit"
                            className="text-danger hover:bg-danger-subtle hover:text-danger"
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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

      <ConfirmDialog
        open={deleting !== null}
        title="Remove this visit?"
        description="The clinical record is deleted for good. This cannot be undone."
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        confirmLabel="Remove visit"
        destructive
      >
        {deleting && (
          <p>
            {deleting.student.fullName}, seen{" "}
            {formatVisitedAt(deleting.visitedAt)} - {deleting.outcomeLabel}.
          </p>
        )}
      </ConfirmDialog>
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
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </TableCell>
    </TableRow>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="card-soft">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
