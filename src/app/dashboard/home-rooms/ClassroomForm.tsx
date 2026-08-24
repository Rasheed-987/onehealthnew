"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { SelectField, TextField } from "@/components/ui/Field";
import {
  CLASSROOM_TEACHER_ROLE,
  GRADE_LEVEL,
  GRADE_LEVEL_LABEL,
} from "@/models/enums";
import type { ClassroomRow } from "@/lib/classrooms";

type FieldErrors = Record<string, string>;

interface TeacherOption {
  id: string;
  name: string;
}

interface TeacherDraft {
  teacher: string;
  role: string;
}

const GRADE_OPTIONS = Object.values(GRADE_LEVEL).map((value) => ({
  value,
  label: GRADE_LEVEL_LABEL[value],
}));

export function ClassroomForm({
  classroom,
  onClose,
  onSaved,
}: {
  classroom: ClassroomRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = classroom !== null;
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<TeacherOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Seeded once on mount; the caller keys this component per classroom and
  // mounts it only while open, so no effect is needed to resynchronise.
  const [teachers, setTeachers] = useState<TeacherDraft[]>(() => {
    if (!classroom) return [];
    return [
      ...(classroom.classTeacher
        ? [
            {
              teacher: classroom.classTeacher.teacherId,
              role: CLASSROOM_TEACHER_ROLE.LEAD as string,
            },
          ]
        : []),
      ...classroom.additionalTeachers.map((t) => ({
        teacher: t.teacherId,
        role: t.role,
      })),
    ];
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/teachers/options");
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setOptionsError(payload.error ?? "Could not load the teacher list.");
          return;
        }
        setOptions(payload.teachers);
      } catch {
        if (!cancelled) setOptionsError("Could not load the teacher list.");
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
      name: text("name"),
      gradeLevel: text("gradeLevel"),
      roomNumber: text("roomNumber"),
      capacity: text("capacity"),
      teachers: teachers.filter((t) => t.teacher),
    };
    if (isEdit) body.isActive = data.get("isActive") === "on";

    try {
      const response = await fetch(
        isEdit ? `/api/classrooms/${classroom.id}` : "/api/classrooms",
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
      onSaved(isEdit ? "Homeroom updated." : "Homeroom added.");
    } catch {
      setFormError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  /** Teachers not already on the roster, so nobody can be added twice. */
  function availableFor(index: number): TeacherOption[] {
    const taken = new Set(
      teachers.filter((_, i) => i !== index).map((t) => t.teacher),
    );
    return options.filter((option) => !taken.has(option.id));
  }

  const leadCount = teachers.filter(
    (t) => t.role === CLASSROOM_TEACHER_ROLE.LEAD,
  ).length;

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={isEdit ? "Edit homeroom" : "Add homeroom"}
      description={
        isEdit
          ? "Update the room, its capacity and who teaches it."
          : "Creates a classroom and assigns the teachers who run it."
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
              label="Name"
              name="name"
              required
              placeholder="Abu Dhabi"
              defaultValue={classroom?.name ?? ""}
              error={fieldErrors.name}
            />
            <SelectField
              label="Grade"
              name="gradeLevel"
              options={GRADE_OPTIONS}
              defaultValue={classroom?.gradeLevel ?? GRADE_LEVEL.PRE_SCHOOL}
              error={fieldErrors.gradeLevel}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Room"
              name="roomNumber"
              placeholder="3"
              defaultValue={classroom?.roomNumber ?? ""}
              error={fieldErrors.roomNumber}
            />
            <TextField
              label="Total seats"
              name="capacity"
              type="number"
              min={1}
              required
              defaultValue={classroom?.capacity ?? 15}
              hint="Used seats above this are flagged, not blocked."
              error={fieldErrors.capacity}
            />
          </div>

          <fieldset className="rounded-control border border-border p-4">
            <legend className="px-1 text-sm font-medium text-foreground">
              Teachers
            </legend>

            {optionsError ? (
              <p className="text-sm text-danger">{optionsError}</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-muted">
                No active teachers yet. Add one on the Teachers screen first.
              </p>
            ) : (
              <>
                {fieldErrors.teachers && (
                  <p className="mb-2 text-sm text-danger">
                    {fieldErrors.teachers}
                  </p>
                )}
                {leadCount === 0 && teachers.length > 0 && (
                  <p className="mb-2 text-sm text-muted">
                    No class teacher set. Mark one of these as the class
                    teacher.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {teachers.map((row, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-48 flex-1">
                        <label className="text-xs text-muted">Teacher</label>
                        <select
                          value={row.teacher}
                          onChange={(event) =>
                            setTeachers((rows) =>
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, teacher: event.target.value }
                                  : r,
                              ),
                            )
                          }
                          className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                        >
                          <option value="">Choose a teacher...</option>
                          {availableFor(index).map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-44">
                        <label className="text-xs text-muted">Role</label>
                        <select
                          value={row.role}
                          onChange={(event) =>
                            setTeachers((rows) =>
                              rows.map((r, i) =>
                                i === index
                                  ? { ...r, role: event.target.value }
                                  : // Only one lead is allowed, so promoting
                                    // one demotes whoever held it.
                                    event.target.value ===
                                        CLASSROOM_TEACHER_ROLE.LEAD &&
                                      r.role === CLASSROOM_TEACHER_ROLE.LEAD
                                    ? {
                                        ...r,
                                        role: CLASSROOM_TEACHER_ROLE.ASSISTANT,
                                      }
                                    : r,
                              ),
                            )
                          }
                          className="mt-1 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                        >
                          <option value={CLASSROOM_TEACHER_ROLE.LEAD}>
                            Class teacher
                          </option>
                          <option value={CLASSROOM_TEACHER_ROLE.ASSISTANT}>
                            Additional teacher
                          </option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setTeachers((rows) =>
                            rows.filter((_, i) => i !== index),
                          )
                        }
                        aria-label="Remove this teacher"
                        className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={teachers.length >= options.length}
                  onClick={() =>
                    setTeachers((rows) => [
                      ...rows,
                      {
                        teacher: "",
                        // The first one added is the class teacher; anyone
                        // after that assists unless changed.
                        role:
                          rows.length === 0
                            ? CLASSROOM_TEACHER_ROLE.LEAD
                            : CLASSROOM_TEACHER_ROLE.ASSISTANT,
                      },
                    ])
                  }
                  className="mt-3 flex items-center gap-1.5 rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} />
                  Add teacher
                </button>
              </>
            )}
          </fieldset>

          {isEdit && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={classroom.isActive}
                className="h-4 w-4 cursor-pointer rounded-sm border-border-strong accent-primary"
              />
              Room in use
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
            {busy ? "Saving..." : isEdit ? "Save changes" : "Add homeroom"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
