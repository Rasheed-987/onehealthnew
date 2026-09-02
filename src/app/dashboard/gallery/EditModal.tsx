"use client";

import { useState } from "react";

import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useClassroomRosterQuery } from "@/hooks/queries";
import type { GalleryItemRow } from "@/lib/gallery";
import { GALLERY_ITEM_TYPE, GALLERY_ITEM_TYPE_LABEL } from "@/models/enums";

/**
 * Editing a photo that is already posted.
 *
 * The media is deliberately not editable - `PUT /api/gallery/:id` has no field
 * for it, and swapping the file under something families have already seen is
 * not a thing the school should be able to do. A different photo is a new post.
 *
 * Re-tagging is allowed but consequential: the tags ARE the audience, so the
 * picker is the roster of the post's own classroom and the API re-runs the
 * same "one room, all seated" gate it uses on create.
 */

export function EditModal({
  item,
  onClose,
  onSaved,
}: {
  item: GalleryItemRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [title, setTitle] = useState(item.title ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [type, setType] = useState<string>(item.type);
  const [takenAt, setTakenAt] = useState(item.takenAt?.slice(0, 10) ?? "");
  const [picked, setPicked] = useState<string[]>(
    item.students.map((s) => s.id),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The audience can only be re-drawn from the post's own room - a gallery item
  // belongs to a single classroom. A failed load leaves the picker empty and
  // the rest of the form still saves.
  const roster =
    useClassroomRosterQuery(item.classroom?.id ?? "").data?.students ?? [];

  function toggleStudent(id: string) {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id],
    );
  }

  async function submit() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      if (picked.length === 0) {
        setFieldErrors({ students: "Tag at least one child." });
        return;
      }

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        type,
        students: picked,
      };
      if (takenAt) body.takenAt = takenAt;

      const response = await fetch(`/api/gallery/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "Could not save the changes.");
        if (payload.details && typeof payload.details === "object") {
          setFieldErrors(payload.details as Record<string, string>);
        }
        return;
      }

      const count = payload.item?.students?.length ?? picked.length;
      onSaved(
        count === 1
          ? "Photo updated. One family can see it."
          : `Photo updated. ${count} families can see it.`,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit photo"
      description={item.classroom?.name ?? undefined}
      width="max-w-xl"
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <TextField
          label="Title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Art corner"
        />

        <div>
          <label
            htmlFor="description"
            className="text-sm font-medium text-foreground"
          >
            Description
          </label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What the children were doing"
            className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>

        <SelectField
          label="Type"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={Object.values(GALLERY_ITEM_TYPE).map((value) => ({
            value,
            label: GALLERY_ITEM_TYPE_LABEL[value],
          }))}
        />

        <div>
          <label
            htmlFor="takenAt"
            className="text-sm font-medium text-foreground"
          >
            Date taken
          </label>
          <input
            id="takenAt"
            type="date"
            value={takenAt}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setTakenAt(event.target.value)}
            className="mt-1.5 block rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>

        <div>
          <span className="text-sm font-medium text-foreground">
            Who can see this<span className="ml-0.5 text-danger">*</span>
          </span>
          <p className="mt-0.5 text-xs text-muted">
            The tagged children&apos;s families - nobody else.
          </p>
          {roster.length === 0 ? (
            <p className="mt-1.5 text-sm text-muted">
              Could not load this classroom&apos;s children. The other fields
              still save.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {roster.map((student) => {
                const on = picked.includes(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => toggleStudent(student.id)}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "border border-border-strong bg-surface text-foreground hover:bg-surface-hover"
                    }`}
                  >
                    {student.fullName}
                  </button>
                );
              })}
            </div>
          )}
          {fieldErrors.students && (
            <p className="mt-1 text-sm text-danger">{fieldErrors.students}</p>
          )}
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
          onClick={submit}
          disabled={saving}
          className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}
