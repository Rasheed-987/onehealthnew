"use client";

import { useEffect, useState } from "react";

import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { ClassroomRow } from "@/lib/classrooms";
import type { ClinicalVisitRow } from "@/lib/clinicalVisits";
import {
  ADDITIONAL_SYMPTOM,
  ADDITIONAL_SYMPTOM_LABEL,
  FLU_SYMPTOM,
  FLU_SYMPTOM_LABEL,
  NURSING_CARE,
  NURSING_CARE_LABEL,
  OTHER_SYMPTOM,
  OTHER_SYMPTOM_LABEL,
  VISIT_OUTCOME,
  VISIT_OUTCOME_LABEL,
} from "@/models/enums";

/**
 * Recording or correcting a clinical visit.
 *
 * The five numbered sections are the five headings on the nurse's form, kept
 * in that order because the nurse fills them in that order: what the child came
 * in with, then what was done, then how it ended.
 *
 * The child cannot be changed on an edit. Moving a record to a different child
 * is a delete and a re-entry - the classroom on the record was derived from the
 * original child's enrolment, and re-pointing one without the other would
 * quietly file the visit in the wrong room.
 */

interface StudentOption {
  id: string;
  fullName: string;
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the browser's own timezone. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function VisitModal({
  visit,
  classrooms,
  onClose,
  onSaved,
}: {
  /** Null when recording a new visit. */
  visit: ClinicalVisitRow | null;
  classrooms: ClassroomRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = visit !== null;

  const [classroom, setClassroom] = useState(classrooms[0]?.id ?? "");
  const [roster, setRoster] = useState<StudentOption[]>([]);
  const [student, setStudent] = useState("");

  const [visitedAt, setVisitedAt] = useState(
    toLocalInput(visit ? new Date(visit.visitedAt) : new Date()),
  );
  const [fluSymptoms, setFluSymptoms] = useState<string[]>(
    visit?.fluSymptoms ?? [],
  );
  const [fluSymptomsOther, setFluSymptomsOther] = useState(
    visit?.fluSymptomsOther ?? "",
  );
  const [otherSymptoms, setOtherSymptoms] = useState<string[]>(
    visit?.otherSymptoms ?? [],
  );
  const [additionalSymptoms, setAdditionalSymptoms] = useState<string[]>(
    visit?.additionalSymptoms ?? [],
  );
  const [additionalSymptomsOther, setAdditionalSymptomsOther] = useState(
    visit?.additionalSymptomsOther ?? "",
  );
  const [nursingCare, setNursingCare] = useState<string[]>(
    visit?.nursingCare ?? [],
  );
  const [careNotes, setCareNotes] = useState(visit?.careNotes ?? "");
  const [outcome, setOutcome] = useState<string>(visit?.outcome ?? "");
  const [notes, setNotes] = useState(visit?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The roster narrows the child picker to one room, which is also the only
  // set the API will accept a visit for. Not needed on an edit.
  useEffect(() => {
    if (isEdit || !classroom) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/classrooms/${classroom}/students`);
        const payload = await response.json().catch(() => ({}));
        if (cancelled || !response.ok) return;
        setRoster(payload.students ?? []);
        setStudent("");
      } catch {
        // Leave the roster empty; the error surfaces on save instead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroom, isEdit]);

  function toggle(
    list: string[],
    set: (next: string[]) => void,
    value: string,
  ) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function submit() {
    setFormError(null);
    setFieldErrors({});

    if (!isEdit && !student) {
      setFieldErrors({ student: "Choose a child." });
      return;
    }
    if (!outcome) {
      setFieldErrors({ outcome: "Choose how the visit ended." });
      return;
    }

    setSaving(true);
    /*
     * Sent as a full ISO instant rather than the raw "2026-08-25T15:58" the
     * input produces: that string carries no zone, so the server would read it
     * against ITS clock and file an afternoon visit hours off.
     */
    const body: Record<string, unknown> = {
      visitedAt: new Date(visitedAt).toISOString(),
      fluSymptoms,
      fluSymptomsOther,
      otherSymptoms,
      additionalSymptoms,
      additionalSymptomsOther,
      nursingCare,
      careNotes,
      outcome,
      notes,
    };
    if (!isEdit) body.student = student;

    try {
      const response = await fetch(
        isEdit ? `/api/clinical-visits/${visit.id}` : "/api/clinical-visits",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload: { error?: string; details?: Record<string, string> } =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not save the visit.");
        if (payload.details) setFieldErrors(payload.details);
        setSaving(false);
        return;
      }
      onSaved(isEdit ? "Visit updated." : "Visit recorded.");
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? "Edit clinical visit" : "New clinical visit"}
      description="Record symptoms, care, and outcome."
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="max-h-[65vh] space-y-6 overflow-y-auto px-6 py-5">
        {formError && (
          <div className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {isEdit ? (
            <div>
              <p className="text-sm font-medium text-foreground">Child</p>
              <p className="mt-1.5 rounded-control border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
                {visit.student.fullName}
                {visit.classroom ? ` - ${visit.classroom.name}` : ""}
              </p>
            </div>
          ) : (
            <>
              <SelectField
                label="Classroom"
                name="classroom"
                value={classroom}
                onChange={(event) => setClassroom(event.target.value)}
                options={classrooms.map((room) => ({
                  value: room.id,
                  label: room.name,
                }))}
              />
              <SelectField
                label="Child"
                name="student"
                value={student}
                error={fieldErrors.student}
                onChange={(event) => setStudent(event.target.value)}
                options={[
                  { value: "", label: "Choose a child" },
                  ...roster.map((child) => ({
                    value: child.id,
                    label: child.fullName,
                  })),
                ]}
              />
            </>
          )}

          <TextField
            label="Seen at"
            name="visitedAt"
            type="datetime-local"
            value={visitedAt}
            error={fieldErrors.visitedAt}
            onChange={(event) => setVisitedAt(event.target.value)}
          />
        </div>

        <Section
          number="01"
          title="Flu-like Symptoms"
          description="Record any common flu symptoms."
        >
          <CheckboxGroup
            options={Object.values(FLU_SYMPTOM).map((value) => ({
              value,
              label: FLU_SYMPTOM_LABEL[value],
            }))}
            picked={fluSymptoms}
            onToggle={(value) => toggle(fluSymptoms, setFluSymptoms, value)}
          />
          <TextField
            label="Other flu symptoms"
            name="fluSymptomsOther"
            value={fluSymptomsOther}
            error={fieldErrors.fluSymptomsOther}
            placeholder="Anything not listed above"
            onChange={(event) => setFluSymptomsOther(event.target.value)}
          />
        </Section>

        <Section
          number="02"
          title="Other Symptoms"
          description="Add any other symptoms observed."
        >
          <CheckboxGroup
            options={Object.values(OTHER_SYMPTOM).map((value) => ({
              value,
              label: OTHER_SYMPTOM_LABEL[value],
            }))}
            picked={otherSymptoms}
            onToggle={(value) => toggle(otherSymptoms, setOtherSymptoms, value)}
          />
        </Section>

        <Section
          number="03"
          title="Additional Symptoms"
          description="Document injuries or other concerns."
        >
          <CheckboxGroup
            options={Object.values(ADDITIONAL_SYMPTOM).map((value) => ({
              value,
              label: ADDITIONAL_SYMPTOM_LABEL[value],
            }))}
            picked={additionalSymptoms}
            onToggle={(value) =>
              toggle(additionalSymptoms, setAdditionalSymptoms, value)
            }
          />
          <TextField
            label="Other additional symptoms"
            name="additionalSymptomsOther"
            value={additionalSymptomsOther}
            error={fieldErrors.additionalSymptomsOther}
            placeholder="Anything not listed above"
            onChange={(event) =>
              setAdditionalSymptomsOther(event.target.value)
            }
          />
        </Section>

        <Section
          number="04"
          title="Nursing Care"
          description="Select or describe the care provided."
        >
          <CheckboxGroup
            options={Object.values(NURSING_CARE).map((value) => ({
              value,
              label: NURSING_CARE_LABEL[value],
            }))}
            picked={nursingCare}
            onToggle={(value) => toggle(nursingCare, setNursingCare, value)}
          />
          <div>
            <label
              htmlFor="careNotes"
              className="text-sm font-medium text-foreground"
            >
              Care notes
            </label>
            <textarea
              id="careNotes"
              name="careNotes"
              rows={2}
              value={careNotes}
              onChange={(event) => setCareNotes(event.target.value)}
              placeholder="Describe anything else that was done"
              className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
          </div>
        </Section>

        <Section
          number="05"
          title="Visit Outcome"
          description="Select the appropriate status."
        >
          <div className="space-y-2">
            {Object.values(VISIT_OUTCOME).map((value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors ${
                  outcome === value
                    ? "border-primary bg-primary-subtle text-primary-active"
                    : "border-border bg-surface text-foreground hover:bg-surface-hover"
                }`}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                  className="accent-[var(--primary)]"
                />
                {VISIT_OUTCOME_LABEL[value]}
              </label>
            ))}
          </div>
          {fieldErrors.outcome && (
            <p className="text-sm text-danger">{fieldErrors.outcome}</p>
          )}
        </Section>

        <div>
          <label htmlFor="notes" className="text-sm font-medium text-foreground">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything that does not fit a section above"
            className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? "Saving..." : isEdit ? "Save changes" : "Save visit record"}
        </button>
      </div>
    </Modal>
  );
}

/** One numbered heading from the paper form, with its fields under it. */
function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CheckboxGroup({
  options,
  picked,
  onToggle,
}: {
  options: readonly { value: string; label: string }[];
  picked: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const checked = picked.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-sm transition-colors ${
              checked
                ? "border-primary bg-primary-subtle text-primary-active"
                : "border-border bg-surface text-foreground hover:bg-surface-hover"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(option.value)}
              className="accent-[var(--primary)]"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
