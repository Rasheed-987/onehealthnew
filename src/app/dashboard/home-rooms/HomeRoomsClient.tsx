"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Notice } from "@/components/dashboard/Notice";
import { Pagination } from "@/components/dashboard/Pagination";
import { SearchInput } from "@/components/dashboard/SearchInput";
import { ClassroomForm } from "./ClassroomForm";
import { RosterModal } from "./RosterModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useClassroomsQuery,
  useInvalidate,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { ClassroomRow } from "@/lib/classrooms";

export function HomeRoomsClient({
  canDelete,
  canAssign,
}: {
  canDelete: boolean;
  canAssign: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomRow | null>(null);
  const [deleting, setDeleting] = useState<ClassroomRow | null>(null);
  const [viewing, setViewing] = useState<ClassroomRow | null>(null);

  const invalidate = useInvalidate();

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isPending, isError, error } = useClassroomsQuery(
    debouncedSearch,
    page,
  );

  const classrooms = data?.classrooms ?? [];
  const pagination = data?.pagination ?? EMPTY_PAGINATION;
  const loadError = isError
    ? errorMessage(error, "Could not load homerooms.")
    : null;

  function afterSave(message: string) {
    setFormOpen(false);
    setEditing(null);
    setNotice(message);
    // Teachers carry the rooms they run on their own row.
    invalidate(queryKeys.classrooms.all, queryKeys.teachers.all);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/classrooms/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWarning(payload.error ?? "Could not delete the homeroom.");
    } else {
      setNotice(`${deleting.name} was deleted.`);
    }
    setDeleting(null);
    // A deleted room un-enrols its children and releases its teachers, so
    // both of those lists - and everything drawn from the roster - are stale.
    invalidate(
      queryKeys.classrooms.all,
      queryKeys.students.all,
      queryKeys.teachers.all,
      queryKeys.attendance.all,
      queryKeys.dailyProgress.all,
      queryKeys.weeklyProgress.all,
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search classes by name or room..."
          aria-label="Search homerooms"
        />
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          Add Homeroom
        </Button>
      </div>

      {warning && (
        <Notice tone="danger" onDismiss={() => setWarning(null)}>
          {warning}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {/* Modern Homeroom Cards Grid */}
      {isPending ? (
        <div className="py-12 text-center text-xs font-semibold text-subtle">
          Loading homerooms...
        </div>
      ) : loadError ? (
        <div className="py-12 text-center text-xs font-bold text-danger">
          {loadError}
        </div>
      ) : classrooms.length === 0 ? (
        <div className="card-soft border-dashed p-12 text-center">
          <p className="text-sm font-bold text-foreground">No homerooms found</p>
          <p className="mt-1 text-xs text-subtle">
            {search
              ? `No homerooms match "${search}".`
              : "No homerooms yet. Add the first one."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((room, index) => {
            // Assign card color style based on index loop to keep it colorful
            const cardColors = [
              { bg: "bg-primary/10", text: "text-primary", progress: "bg-primary" },
              { bg: "bg-crayon-blue/10", text: "text-crayon-blue", progress: "bg-crayon-blue" },
              { bg: "bg-crayon-purple/10", text: "text-crayon-purple", progress: "bg-crayon-purple" },
              { bg: "bg-warning/10", text: "text-warning", progress: "bg-warning" },
            ];
            const colorTheme = cardColors[index % cardColors.length];
            const occupancyPct = Math.min((room.usedSeats / room.capacity) * 100, 100);

            return (
              <Card
                key={room.id}
                className="card-soft group flex flex-col justify-between p-5 transition-all hover:-translate-y-0.5 hover:shadow-raised"
              >
                <div>
                  {/* Header info */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-extrabold text-foreground">
                        {room.name}
                      </h3>
                      <p className="text-[11px] font-bold text-subtle mt-0.5">
                        {room.gradeLabel}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 items-end">
                      {room.roomNumber && (
                        <span className="rounded-lg bg-surface-muted border border-border px-2 py-0.5 text-[10px] font-extrabold text-muted">
                          Room {room.roomNumber}
                        </span>
                      )}
                      {!room.isActive && (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[9px] font-bold text-subtle uppercase tracking-wider">
                          Not in use
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Seat capacity bar */}
                  <div className="mt-5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-subtle">Class Seats Occupancy</span>
                      <span className="font-bold text-foreground">
                        <span className={room.isOverCapacity ? "text-danger" : colorTheme.text}>
                          {room.usedSeats}
                        </span>{" "}
                        / {room.capacity}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          room.isOverCapacity ? "bg-danger" : colorTheme.progress
                        }`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Lead Class Teacher Block */}
                  <div className="mt-5 pt-4 border-t border-surface-muted">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-subtle block mb-2">
                      Class Teacher
                    </span>
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-xs ${colorTheme.bg} ${colorTheme.text}`}>
                        {room.classTeacher ? room.classTeacher.name.charAt(0) : "?"}
                      </div>
                      <div>
                        {room.classTeacher ? (
                          <span className="text-xs font-bold text-foreground">
                            {room.classTeacher.name}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-warning italic">
                            Unassigned
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Additional Staff */}
                  {room.additionalTeachers.length > 0 && (
                    <div className="mt-4">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-subtle block mb-1.5">
                        Assisting Staff
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {room.additionalTeachers.map((teacher) => (
                          <span
                            key={teacher.teacherId}
                            className="rounded-lg bg-surface-muted border border-border px-2 py-0.5 text-[10px] font-medium text-muted"
                          >
                            {teacher.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Row */}
                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewing(room)}
                    className="flex-1"
                  >
                    <Users size={14} className={colorTheme.text} />
                    <span>{canAssign ? "Add Students" : "View Roster"}</span>
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(room);
                        setFormOpen(true);
                      }}
                      title="Edit Homeroom"
                      aria-label={`Edit ${room.name}`}
                      className="text-subtle"
                    >
                      <Pencil size={15} />
                    </Button>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(room)}
                        title="Delete Homeroom"
                        aria-label={`Delete ${room.name}`}
                        className="text-subtle hover:bg-danger-subtle hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {/* Keyed per room and mounted only while open, so each open is a fresh
          mount that seeds its roster rows from props. */}
      {formOpen && (
        <ClassroomForm
          key={editing?.id ?? "new"}
          classroom={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={afterSave}
        />
      )}

      {viewing && (
        <RosterModal
          key={viewing.id}
          classroom={viewing}
          canAssign={canAssign}
          onClose={() => setViewing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
        destructive
        title="Delete homeroom"
        description="This removes the classroom record."
      >
        Delete <strong>{deleting?.name}</strong>? This cannot be undone. To keep
        the record but take the room out of service, edit it and untick
        &ldquo;Room in use&rdquo; instead.
      </ConfirmDialog>
    </>
  );
}
