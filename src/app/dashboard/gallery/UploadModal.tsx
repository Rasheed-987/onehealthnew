"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import { SelectField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useClassroomRosterQuery } from "@/hooks/queries";
import type { ClassroomRow } from "@/lib/classrooms";
import { GALLERY_ITEM_TYPE, GALLERY_ITEM_TYPE_LABEL } from "@/models/enums";

/**
 * Posting a photo.
 *
 * The audience picker is the whole point of this form. Tagging IS the
 * visibility rule - the guardians of the tagged children can see the post and
 * nobody else - so the choice is put in front of the teacher as a decision
 * with consequences spelled out, not buried as an optional field.
 */

export function UploadModal({
  classrooms,
  onClose,
  onSaved,
}: {
  classrooms: ClassroomRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [audience, setAudience] = useState<"classroom" | "students">(
    "classroom",
  );
  const [classroom, setClassroom] = useState(classrooms[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>(GALLERY_ITEM_TYPE.UPDATE);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /*
   * The roster drives the per-child picker, and is also what the classroom
   * option silently expands to - showing it makes that expansion visible.
   *
   * Shared with the roster panel and the clinical-visit form through the
   * cache, so a room already opened elsewhere fills this in with no request.
   * A failure leaves it empty; the classroom option still works.
   */
  const roster = useClassroomRosterQuery(classroom).data?.students ?? [];

  /*
   * The preview URL is made where the file is chosen rather than in an effect
   * reacting to it: an effect would set state during render-commit and
   * cascade a second render for something already known at the click.
   *
   * Object URLs leak until revoked, so the previous one is released on every
   * change and the last one on unmount - hence the ref, which survives the
   * closure the cleanup would otherwise capture.
   */
  const previewRef = useRef<string | null>(null);

  function pickFile(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = next ? URL.createObjectURL(next) : null;
    previewRef.current = url;
    setFile(next);
    setPreview(url);
  }

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

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
      if (!file) {
        setFieldErrors({ file: "Choose a photo or video." });
        return;
      }

      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title.trim());
      if (description.trim()) form.set("description", description.trim());
      form.set("type", type);

      // Exactly one of the two - the API rejects both and neither.
      if (audience === "classroom") {
        form.set("classroom", classroom);
      } else {
        for (const id of picked) form.append("students", id);
      }

      const response = await fetch("/api/gallery", {
        method: "POST",
        // No Content-Type header: the browser has to set the multipart
        // boundary itself, and setting it by hand breaks the parse.
        body: form,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "Could not post the photo.");
        if (payload.details && typeof payload.details === "object") {
          setFieldErrors(payload.details as Record<string, string>);
        }
        return;
      }

      const count = payload.item?.students?.length ?? 0;
      onSaved(
        count === 1
          ? "Photo posted. One family can see it."
          : `Photo posted. ${count} families can see it.`,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const roomName =
    classrooms.find((c) => c.id === classroom)?.name ?? "this classroom";

  return (
    <Modal
      open
      onClose={onClose}
      title="Post a photo"
      description="Whoever is tagged is exactly who can see it."
      width="max-w-xl"
    >
      <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
        {error && (
          <div className="rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div>
          <span className="text-sm font-medium text-foreground">
            Photo or video<span className="ml-0.5 text-danger">*</span>
          </span>
          <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-control border border-dashed border-border-strong bg-surface px-3 py-4 transition-colors hover:bg-surface-hover">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="h-16 w-16 rounded-control object-cover"
              />
            ) : (
              <ImagePlus size={24} className="text-subtle" />
            )}
            <span className="text-sm text-muted">
              {file ? file.name : "JPEG, PNG, WebP, GIF or MP4"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
              className="sr-only"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {fieldErrors.file && (
            <p className="mt-1 text-sm text-danger">{fieldErrors.file}</p>
          )}
        </div>

        <SelectField
          label="Classroom"
          name="classroom"
          value={classroom}
          onChange={(event) => {
            setClassroom(event.target.value);
            // The tags belonged to the room being left. Carrying them over
            // would post this photo to another room's families.
            setPicked([]);
          }}
          options={classrooms.map((room) => ({
            value: room.id,
            label: room.name,
          }))}
        />

        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Who can see this
          </legend>
          <div className="mt-2 space-y-2">
            <AudienceOption
              checked={audience === "classroom"}
              onSelect={() => setAudience("classroom")}
              label={`Everyone in ${roomName}`}
              detail={
                roster.length > 0
                  ? `Tags all ${roster.length} children, so every family in the room sees it.`
                  : "Tags every child currently in the room."
              }
            />
            <AudienceOption
              checked={audience === "students"}
              onSelect={() => setAudience("students")}
              label="Only certain children"
              detail="Just the families of the children you tick below."
            />
          </div>
        </fieldset>

        {audience === "students" && (
          <div>
            <span className="text-sm font-medium text-foreground">
              Children<span className="ml-0.5 text-danger">*</span>
            </span>
            {roster.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted">
                No children are in this classroom yet.
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
          {saving ? "Posting..." : "Post photo"}
        </button>
      </div>
    </Modal>
  );
}

function AudienceOption({
  checked,
  onSelect,
  label,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-control border px-3 py-2.5 transition-colors ${
        checked
          ? "border-primary bg-primary-subtle"
          : "border-border-strong bg-surface hover:bg-surface-hover"
      }`}
    >
      <input
        type="radio"
        name="audience"
        checked={checked}
        onChange={onSelect}
        className="mt-1 accent-[var(--color-primary,#2f7d4f)]"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </label>
  );
}
