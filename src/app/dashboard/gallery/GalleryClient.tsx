"use client";

import { useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Notice } from "@/components/dashboard/Notice";
import {
  queryKeys,
  useClassroomPickerQuery,
  useGalleryQuery,
  useInvalidate,
} from "@/hooks/queries";
import { useDismissibleError } from "@/hooks/useDismissibleError";
import type { GalleryItemRow } from "@/lib/gallery";
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
  const [classroom, setClassroom] = useState("");
  const [type, setType] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<GalleryItemRow | null>(null);
  const [deleting, setDeleting] = useState<GalleryItemRow | null>(null);

  const invalidate = useInvalidate();

  const classrooms = useClassroomPickerQuery(canCreate).data?.classrooms ?? [];

  // Both filters are dropdowns - one change per click - so there is nothing to
  // debounce. A combination already looked at comes back from the cache.
  const gallery = useGalleryQuery(classroom, type);
  const { data, isPending } = gallery;

  const items = data?.items ?? [];

  // A failed delete and a failed load share the one dismissible line, the
  // delete first because it is the thing that just happened.
  const [banner, dismissBanner] = useDismissibleError(
    gallery,
    "Could not load the gallery.",
  );
  const loadError = deleteError ?? banner;

  function dismissError() {
    setDeleteError(null);
    dismissBanner();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/gallery/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleteError(payload.error ?? "Could not remove the photo.");
    } else {
      setDeleteError(null);
      setNotice("Photo removed. Families can no longer see it.");
    }
    setDeleting(null);
    invalidate(queryKeys.gallery.all);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {canCreate && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Classroom
            </span>
            <Select
              value={classroom || "__all__"}
              onValueChange={(value) => setClassroom(value === "__all__" ? "" : value)}
            >
              <SelectTrigger className="min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classrooms</SelectItem>
                {classrooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Type
          </span>
          <Select
            value={type || "__all__"}
            onValueChange={(value) => setType(value === "__all__" ? "" : value)}
          >
            <SelectTrigger className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              {Object.values(GALLERY_ITEM_TYPE).map((value) => (
                <SelectItem key={value} value={value}>
                  {GALLERY_ITEM_TYPE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {canCreate && (
          <Button type="button" className="ml-auto" onClick={() => setUploading(true)}>
            <Plus size={16} />
            Post a photo
          </Button>
        )}
      </div>

      {loadError && (
        <Notice tone="danger" onDismiss={dismissError}>
          {loadError}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {isPending ? (
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
            <Card key={item.id} className="card-soft overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setViewing(item)}
                className="block w-full"
                aria-label={`View ${item.title ?? "photo"}`}
              >
                <Media item={item} className="h-44 w-full object-cover" />
              </button>

              <CardContent className="space-y-2 p-4">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(item)}
                      aria-label={`Remove ${item.title ?? "photo"}`}
                      className="text-danger hover:bg-danger-subtle hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
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
            invalidate(queryKeys.gallery.all);
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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel="Remove"
        destructive
        title="Remove photo"
        description="It disappears from every family feed."
      >
        Remove <strong>{deleting?.title ?? "this photo"}</strong>? The post is
        kept so it can be restored, but no family will see it any more.
      </ConfirmDialog>
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
    <div className="card-soft border-dashed p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}
