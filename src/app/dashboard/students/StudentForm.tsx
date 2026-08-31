"use client";

import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useParentOptionsQuery } from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import { GENDER, GUARDIAN_RELATIONSHIP } from "@/models/enums";
import type { StudentRow } from "@/lib/students";

type FieldErrors = Record<string, string>;

/**
 * One row of the guardian editor.
 *
 * Two kinds, because a family enrolling for the first time has no accounts to
 * pick from: `existing` is someone found in the search, `new` is someone typed
 * straight onto this form, whose account the API creates alongside the child.
 */
type GuardianDraft =
  | {
      kind: "existing";
      parent: string;
      /** Cached for display - the search results are not kept around. */
      label: string;
      relationship: string;
    }
  | {
      kind: "new";
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      relationship: string;
    };

const CONTROL_CLASS =
  "mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25";

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

  const [search, setSearch] = useState("");
  /*
   * Seeded from props once, on mount. The caller renders this component only
   * while the dialog is open and gives it a `key` per student, so every open
   * is a fresh mount - which is why this needs no effect to resynchronise, and
   * cannot show the previously edited child's guardians.
   */
  const [guardians, setGuardians] = useState<GuardianDraft[]>(() =>
    student
      ? student.guardians.map((g) => ({
          kind: "existing" as const,
          parent: g.parentId,
          label: `${g.name} (${g.email})`,
          relationship: g.relationship,
        }))
      : [],
  );
  /*
   * Debounced, because this fires on every keystroke and the endpoint runs a
   * regex over the user collection. An empty box still queries: the API answers
   * it with the most recently added guardians, which is very often the one
   * wanted when enrolling a sibling.
   *
   * Backspacing through a term now costs nothing - every prefix on the way
   * back is a term already asked for, so it comes from the cache - and the
   * results already listed stay put while a new term is fetched.
   */
  const debouncedSearch = useDebouncedValue(search, 250);
  const guardianSearch = useParentOptionsQuery(debouncedSearch);

  const results = guardianSearch.data?.parents ?? [];
  const optionsError = guardianSearch.isError
    ? errorMessage(guardianSearch.error, "Could not search guardians.")
    : null;

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
      studentId: text("studentId"),
      gender: text("gender"),
      nationality: text("nationality"),
      medicalNotes: text("medicalNotes"),
      // Half-typed new-guardian rows are dropped rather than sent as empty
      // strings the API would have to reject.
      guardians: guardians.filter(
        (g) => g.kind === "existing" || (g.firstName && g.lastName && g.email),
      ),
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

  /** Search hits not already on this child, so the same one cannot be added twice. */
  const linked = new Set(
    guardians.flatMap((g) => (g.kind === "existing" ? [g.parent] : [])),
  );
  const addable = results.filter((option) => !linked.has(option.id));

  function update(index: number, patch: Partial<GuardianDraft>) {
    setGuardians((rows) =>
      rows.map((row, i) =>
        i === index ? ({ ...row, ...patch } as GuardianDraft) : row,
      ),
    );
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

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Student ID"
              name="studentId"
              placeholder="The school's admission number"
              defaultValue={student?.studentId ?? ""}
              hint="A guardian types this into the app to ask for access to this child."
              error={fieldErrors.studentId}
            />
            <TextField
              label="Nationality"
              name="nationality"
              defaultValue={student?.nationality ?? ""}
              error={fieldErrors.nationality}
            />
          </div>

          <TextField
            label="Medical notes"
            name="medicalNotes"
            placeholder="Allergies, medication, anything staff must know"
            defaultValue={student?.medicalNotes ?? ""}
            error={fieldErrors.medicalNotes}
          />

          <fieldset className="rounded-control border border-border p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              Guardians{" "}
              <span className="font-normal text-muted">(optional)</span>
            </legend>

            {fieldErrors.guardians && (
              <p className="mb-2 text-sm text-danger">
                {fieldErrors.guardians}
              </p>
            )}

            {/* Two ways to attach a family, and the second one is why this is
                no longer required: the child's record has to exist before a
                guardian can register against its student ID. */}
            {guardians.length === 0 && (
              <p className="mb-3 text-sm text-muted">
                Add the family now &mdash; search below, or add someone new. Or
                leave this empty, give them the student ID above, and approve
                them under Link Requests when they register in the app. The
                child will show as &ldquo;No guardian&rdquo; until one of those
                happens.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {guardians.map((guardian, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-2 rounded-control bg-surface-hover/40 p-2"
                >
                  {guardian.kind === "existing" ? (
                    <p className="min-w-48 flex-1 py-2 text-sm text-foreground">
                      {guardian.label}
                    </p>
                  ) : (
                    <div className="flex min-w-48 flex-1 flex-wrap gap-2">
                      <input
                        value={guardian.firstName}
                        onChange={(e) =>
                          update(index, { firstName: e.target.value })
                        }
                        placeholder="First name"
                        aria-label="Guardian first name"
                        className={`${CONTROL_CLASS} min-w-28 flex-1`}
                      />
                      <input
                        value={guardian.lastName}
                        onChange={(e) =>
                          update(index, { lastName: e.target.value })
                        }
                        placeholder="Last name"
                        aria-label="Guardian last name"
                        className={`${CONTROL_CLASS} min-w-28 flex-1`}
                      />
                      <input
                        type="email"
                        value={guardian.email}
                        onChange={(e) =>
                          update(index, { email: e.target.value })
                        }
                        placeholder="Email (their invitation goes here)"
                        aria-label="Guardian email"
                        className={`${CONTROL_CLASS} min-w-52 flex-1`}
                      />
                      <input
                        value={guardian.phone}
                        onChange={(e) =>
                          update(index, { phone: e.target.value })
                        }
                        placeholder="Phone (optional)"
                        aria-label="Guardian phone"
                        className={`${CONTROL_CLASS} min-w-36 flex-1`}
                      />
                    </div>
                  )}

                  <div className="w-40">
                    <label className="text-xs text-muted">Relationship</label>
                    <select
                      value={guardian.relationship}
                      onChange={(e) =>
                        update(index, { relationship: e.target.value })
                      }
                      className={CONTROL_CLASS}
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
                      setGuardians((rows) => rows.filter((_, i) => i !== index))
                    }
                    aria-label="Remove this guardian"
                    className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <label className="text-xs text-muted" htmlFor="guardian-search">
                Search existing guardians
              </label>
              <div className="relative mt-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  id="guardian-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email or phone"
                  className="w-full rounded-control border border-border bg-surface py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                />
              </div>

              {optionsError ? (
                <p className="mt-2 text-sm text-danger">{optionsError}</p>
              ) : addable.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No guardian matches that. Add them as someone new below.
                </p>
              ) : (
                <ul className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto">
                  {addable.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setGuardians((rows) => [
                            ...rows,
                            {
                              kind: "existing",
                              parent: option.id,
                              label: `${option.name} (${option.email})`,
                              relationship: GUARDIAN_RELATIONSHIP.GUARDIAN,
                            },
                          ]);
                          setSearch("");
                        }}
                        className="w-full rounded-control px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                      >
                        <span className="block text-sm text-foreground">
                          {option.name}
                        </span>
                        <span className="block text-xs text-muted">
                          {option.email}
                          {option.phone ? ` · ${option.phone}` : ""}
                          {/* The children are what tell two same-named guardians apart. */}
                          {option.children.length > 0
                            ? ` · ${option.children.map((c) => c.name).join(", ")}`
                            : " · no children linked yet"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setGuardians((rows) => [
                  ...rows,
                  {
                    kind: "new",
                    firstName: "",
                    lastName: "",
                    email: "",
                    phone: "",
                    relationship: GUARDIAN_RELATIONSHIP.GUARDIAN,
                  },
                ])
              }
              className="mt-3 flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              <Plus size={14} />
              Add someone new
            </button>
            <p className="mt-2 text-xs text-muted">
              A new guardian gets an account and an emailed invitation when you
              save.
            </p>
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
