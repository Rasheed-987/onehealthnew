"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import { GENDER, GUARDIAN_RELATIONSHIP } from "@/models/enums";
import type { StudentRow } from "@/lib/students";

type FieldErrors = Record<string, string>;

interface ParentOption {
  id: string;
  name: string;
  email: string;
}

/** One row of the guardian editor. */
interface GuardianDraft {
  parent: string;
  relationship: string;
}

const GENDER_OPTIONS = [
  { value: GENDER.MALE, label: "Male" },
  { value: GENDER.FEMALE, label: "Female" },
  { value: GENDER.OTHER, label: "Other" },
];

const RELATIONSHIP_OPTIONS = [
  { value: GUARDIAN_RELATIONSHIP.MOTHER, label: "Mother" },
  { value: GUARDIAN_RELATIONSHIP.FATHER, label: "Father" },
  { value: GUARDIAN_RELATIONSHIP.GUARDIAN, label: "Guardian" },
  { value: GUARDIAN_RELATIONSHIP.OTHER, label: "Other" },
];

export function StudentForm({
  open,
  student,
  onClose,
  onSaved,
}: {
  open: boolean;
  student: StudentRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = student !== null;
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  /*
   * Seeded from props once, on mount. The caller renders this component only
   * while the dialog is open and gives it a `key` per student, so every open
   * is a fresh mount - which is why this needs no effect to resynchronise, and
   * cannot show the previously edited child's guardians.
   */
  const [guardians, setGuardians] = useState<GuardianDraft[]>(() =>
    student
      ? student.guardians.map((g) => ({
          parent: g.parentId,
          relationship: g.relationship,
        }))
      : [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/parents/options");
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setOptionsError(payload.error ?? "Could not load the parent list.");
          return;
        }
        setParentOptions(payload.parents);
      } catch {
        if (!cancelled) setOptionsError("Could not load the parent list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setBusy(true);

    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();

    const body: Record<string, unknown> = {
      firstName: text("firstName"),
      lastName: text("lastName"),
      dateOfBirth: text("dateOfBirth"),
      gender: text("gender"),
      nationality: text("nationality"),
      medicalNotes: text("medicalNotes"),
      // Rows where no parent was chosen yet are dropped rather than sent as
      // empty strings the API would have to reject.
      guardians: guardians.filter((g) => g.parent),
    };
    if (isEdit) body.isActive = data.get("isActive") === "on";

    try {
      const response = await fetch(
        isEdit ? `/api/students/${student.id}` : "/api/students",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload: { error?: string; details?: FieldErrors } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setFormError(payload.error ?? "Could not save. Please try again.");
        if (payload.details) setFieldErrors(payload.details);
        setBusy(false);
        return;
      }

      onSaved(isEdit ? "Student updated." : "Student added.");
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  /** Parents not already on this child, so the same one cannot be picked twice. */
  function availableFor(index: number): ParentOption[] {
    const taken = new Set(
      guardians.filter((_, i) => i !== index).map((g) => g.parent),
    );
    return parentOptions.filter((option) => !taken.has(option.id));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={isEdit ? "Edit student" : "Add student"}
      description={
        isEdit
          ? "Update this child's details and who is responsible for them."
          : "Adds a child and links the guardians who may be contacted."
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          {formError && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="First name"
              name="firstName"
              required
              defaultValue={student?.firstName ?? ""}
              error={fieldErrors.firstName}
            />
            <TextField
              label="Last name"
              name="lastName"
              required
              defaultValue={student?.lastName ?? ""}
              error={fieldErrors.lastName}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Date of birth"
              name="dateOfBirth"
              type="date"
              required
              defaultValue={student?.dateOfBirth.slice(0, 10) ?? ""}
              hint="Age is worked out from this, so it never goes stale."
              error={fieldErrors.dateOfBirth}
            />
            <SelectField
              label="Gender"
              name="gender"
              options={GENDER_OPTIONS}
              defaultValue={student?.gender ?? GENDER.MALE}
              error={fieldErrors.gender}
            />
          </div>

          <TextField
            label="Nationality"
            name="nationality"
            defaultValue={student?.nationality ?? ""}
            error={fieldErrors.nationality}
          />

          <TextField
            label="Medical notes"
            name="medicalNotes"
            placeholder="Allergies, medication, anything staff must know"
            defaultValue={student?.medicalNotes ?? ""}
            error={fieldErrors.medicalNotes}
          />

          <fieldset className="rounded-control border border-border p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              Guardians
            </legend>

            {optionsError ? (
              <p className="text-sm text-danger">{optionsError}</p>
            ) : parentOptions.length === 0 ? (
              <p className="text-sm text-muted">
                No parents exist yet. Add one on the Parents screen first, then
                come back and link them here.
              </p>
            ) : (
              <>
                {fieldErrors.guardians && (
                  <p className="mb-2 text-sm text-danger">
                    {fieldErrors.guardians}
                  </p>
                )}

                {guardians.length === 0 && (
                  <p className="mb-3 text-sm text-muted">
                    No guardian linked yet. A child with no guardian will not
                    appear on any parent&rsquo;s dashboard.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {guardians.map((guardian, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-48 flex-1">
                        <label className="text-xs text-muted">Parent</label>
                        <select
                          value={guardian.parent}
                          onChange={(event) =>
                            setGuardians((rows) =>
                              rows.map((row, i) =>
                                i === index
                                  ? { ...row, parent: event.target.value }
                                  : row,
                              ),
                            )
                          }
                          className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                        >
                          <option value="">Choose a parent...</option>
                          {availableFor(index).map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} ({option.email})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-40">
                        <label className="text-xs text-muted">
                          Relationship
                        </label>
                        <select
                          value={guardian.relationship}
                          onChange={(event) =>
                            setGuardians((rows) =>
                              rows.map((row, i) =>
                                i === index
                                  ? { ...row, relationship: event.target.value }
                                  : row,
                              ),
                            )
                          }
                          className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                        >
                          {RELATIONSHIP_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setGuardians((rows) =>
                            rows.filter((_, i) => i !== index),
                          )
                        }
                        aria-label="Remove this guardian"
                        className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={guardians.length >= parentOptions.length}
                  onClick={() =>
                    setGuardians((rows) => [
                      ...rows,
                      {
                        parent: "",
                        relationship: GUARDIAN_RELATIONSHIP.GUARDIAN,
                      },
                    ])
                  }
                  className="mt-3 flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add guardian
                </button>
              </>
            )}
          </fieldset>

          {isEdit && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={student.isActive}
                className="h-4 w-4 cursor-pointer rounded-sm border-border-strong accent-primary"
              />
              Currently attending
            </label>
          )}
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
            type="submit"
            disabled={busy}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "Saving..." : isEdit ? "Save changes" : "Add student"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
