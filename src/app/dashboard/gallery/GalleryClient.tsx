"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { GalleryItemRow } from "@/lib/gallery";
import type { ClassroomRow } from "@/lib/classrooms";
import { GALLERY_ITEM_TYPE, GALLERY_ITEM_TYPE_LABEL } from "@/models/enums";
import { UploadModal } from "./UploadModal";

/**
 * The gallery.
 *
 * A grid rather than a table: these are photographs, and the thing a guardian
 * came for is the picture. The tag list rides on every card because on this
 * screen the tags are not a caption - they are the answer to "who can see
 * this", and staff need that legible before they post again.
 *
 * As everywhere else in the dashboard, no role branching here beyond which
 * buttons render. `GET /api/gallery` scopes itself: the whole school for an
 * admin, their rooms for a teacher, and for a guardian only items tagged with
 * one of their own children.
 */

export function GalleryClient({
  canCreate,
  canDelete,
}: {
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [items, setItems] = useState<GalleryItemRow[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [classroom, setClassroom] = useState("");
  const [type, setType] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<GalleryItemRow | null>(null);
  const [deleting, setDeleting] = useState<GalleryItemRow | null>(null);

  useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/classrooms?perPage=100");
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setClassrooms(payload.classrooms ?? []);
      } catch {
        // A failed picker is not a failed page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canCreate]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (classroom) params.set("classroom", classroom);
      if (type) params.set("type", type);

      const response = await fetch(`/api/gallery?${params}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(payload.error ?? "Could not load the gallery.");
        setItems([]);
        return;
      }
      setItems(payload.items ?? []);
    } catch {
      setLoadError("Could not reach the server.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [classroom, type]);

  // Deferred so the effect body does not setState synchronously.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/gallery/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setLoadError(payload.error ?? "Could not remove the photo.");
    } else {
      setNotice("Photo removed. Families can no longer see it.");
    }
    setDeleting(null);
    void load();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {canCreate && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Classroom
            </span>
            <select
              value={classroom}
              onChange={(event) => setClassroom(event.target.value)}
              className="min-w-48 rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            >
              <option value="">All classrooms</option>
              {classrooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Type
          </span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="min-w-40 rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          >
            <option value="">All types</option>
            {Object.values(GALLERY_ITEM_TYPE).map((value) => (
              <option key={value} value={value}>
                {GALLERY_ITEM_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        {canCreate && (
          <button
            type="button"
            onClick={() => setUploading(true)}
            className="ml-auto flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Plus size={16} />
            Post a photo
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-primary/25 bg-primary-subtle px-3 py-2 text-sm text-primary-active">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <EmptyState>Loading the gallery...</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>
          {canCreate
            ? "No photos yet. Post the first one."
            : "No photos have been shared with you yet."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
            >
              <button
                type="button"
                onClick={() => setViewing(item)}
                className="block w-full"
                aria-label={`View ${item.title ?? "photo"}`}
              >
                <Media item={item} className="h-44 w-full object-cover" />
              </button>

              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {item.title ?? item.typeLabel}
                  </h3>
                  <Badge tone="neutral">{item.typeLabel}</Badge>
                </div>

                {item.description && (
                  <p className="line-clamp-2 text-sm text-muted">
                    {item.description}
                  </p>
                )}

                {/* The tags are the audience, so they are shown, not hidden. */}
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Users size={13} />
                  <span>
                    {item.students.length === 1
                      ? item.students[0].fullName
                      : `${item.students.length} children`}
                  </span>
                  {item.classroom && <span>· {item.classroom.name}</span>}
                </div>

                {canDelete && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDeleting(item)}
                      aria-label={`Remove ${item.title ?? "photo"}`}
                      className="rounded-control p-2 text-danger transition-colors hover:bg-danger-subtle"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {uploading && (
        <UploadModal
          classrooms={classrooms}
          onClose={() => setUploading(false)}
          onSaved={(message) => {
            setUploading(false);
            setNotice(message);
            void load();
          }}
        />
      )}

      {viewing && (
        <Modal
          open
          onClose={() => setViewing(null)}
          title={viewing.title ?? viewing.typeLabel}
          description={viewing.classroom?.name}
          width="max-w-2xl"
        >
          <div className="space-y-4 px-6 py-5">
            <Media
              item={viewing}
              className="max-h-[50vh] w-full rounded-card object-contain"
            />
            {viewing.description && (
              <p className="text-sm text-foreground">{viewing.description}</p>
            )}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Visible to the families of
              </h4>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {viewing.students.map((student) => (
                  <Badge key={student.id} tone="success">
                    {student.fullName}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted">
              Posted by {viewing.teacher?.name ?? "Unknown"} on{" "}
              {new Date(viewing.createdAt).toLocaleDateString()}
            </p>
          </div>
        </Modal>
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove photo"
        description="It disappears from every family feed."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Remove <strong>{deleting?.title ?? "this photo"}</strong>? The post is
          kept so it can be restored, but no family will see it any more.
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
            onClick={confirmDelete}
            className="rounded-control bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover"
          >
            Remove
          </button>
        </div>
      </Modal>
    </>
  );
}

/**
 * Uploads are served straight off `public/uploads`, so `next/image` would want
 * a loader config for no benefit here - a plain tag keeps the media module the
 * only thing that knows where files live.
 */
function Media({
  item,
  className,
}: {
  item: GalleryItemRow;
  className: string;
}) {
  if (item.mediaKind === "VIDEO") {
    return <video src={item.mediaUrl} controls className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.thumbnailUrl ?? item.mediaUrl}
      alt={item.title ?? item.description ?? "Gallery photo"}
      className={className}
    />
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}
