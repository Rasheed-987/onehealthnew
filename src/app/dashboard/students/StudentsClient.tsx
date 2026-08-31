"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
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
import { Pagination } from "@/components/dashboard/Pagination";
import { SearchInput } from "@/components/dashboard/SearchInput";
import { StudentForm } from "./StudentForm";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useInvalidate,
  useStudentsQuery,
} from "@/hooks/queries";
import { errorMessage } from "@/lib/fetchJson";
import type { StudentRow } from "@/lib/students";
import { GUARDIAN_RELATIONSHIP } from "@/models/enums";

const RELATIONSHIP_LABEL: Record<string, string> = {
  [GUARDIAN_RELATIONSHIP.MOTHER]: "Mother",
  [GUARDIAN_RELATIONSHIP.FATHER]: "Father",
  [GUARDIAN_RELATIONSHIP.GUARDIAN]: "Guardian",
  [GUARDIAN_RELATIONSHIP.OTHER]: "Other",
};

export function StudentsClient({
  canCreate,
  canDelete,
}: {
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);

  const invalidate = useInvalidate();

  // Debounced so typing does not fire a request per keystroke. The delay is on
  // the term rather than on the fetch, so paging is immediate and a term
  // already in the cache comes back without a round trip.
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, isPending, isError, error } = useStudentsQuery(
    debouncedSearch,
    page,
  );

  const students = data?.students ?? [];
  const pagination = data?.pagination ?? EMPTY_PAGINATION;
  const loadError = isError ? errorMessage(error, "Could not load students.") : null;

  function afterSave(message: string) {
    setFormOpen(false);
    setEditing(null);
    setNotice(message);
    /*
     * A child's guardians hang off this record and the form can create their
     * accounts outright, so the parents list is stale too - and their room
     * makes the classroom rosters stale with it.
     */
    invalidate(
      queryKeys.students.all,
      queryKeys.classrooms.all,
      queryKeys.parents.all,
    );
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/students/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const room = payload.details?.classroom as string | undefined;
      setWarning(
        room ? `${payload.error} (${room})` : (payload.error ?? "Could not delete."),
      );
    } else {
      setNotice(`${deleting.fullName} was removed.`);
    }
    setDeleting(null);
    // Removing a child takes them off every screen built from a roster.
    invalidate(
      queryKeys.students.all,
      queryKeys.classrooms.all,
      queryKeys.attendance.all,
      queryKeys.dailyProgress.all,
      queryKeys.weeklyProgress.all,
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search students by name or ID..."
          aria-label="Search students"
        />
        {canCreate && (
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} />
            Add Student
          </Button>
        )}
      </div>

      {warning && (
        <Notice tone="danger" onDismiss={() => setWarning(null)}>
          {warning}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted hover:bg-surface-muted">
                <TableHead className="px-5 py-3.5">Name</TableHead>
                <TableHead className="px-4 py-3.5">Class</TableHead>
                <TableHead className="px-4 py-3.5">Age</TableHead>
                <TableHead className="px-4 py-3.5">Gender / Info</TableHead>
                <TableHead className="px-4 py-3.5">Parents</TableHead>
                <TableHead className="px-4 py-3.5">Status</TableHead>
                <TableHead className="px-5 py-3.5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <EmptyRow>Loading students...</EmptyRow>
              ) : loadError ? (
                <EmptyRow tone="danger">{loadError}</EmptyRow>
              ) : students.length === 0 ? (
                <EmptyRow>
                  {search
                    ? `No children match "${search}".`
                    : canCreate
                      ? "No children yet. Add the first one."
                      : "No children are linked to you yet. The school adds them."}
                </EmptyRow>
              ) : (
                students.map((student) => (
                  <TableRow key={student.id} className="text-xs">
                    <TableCell className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success font-bold text-xs">
                          {student.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">
                            {student.fullName}
                          </div>
                          {student.studentId && (
                            <div className="font-mono text-[10px] text-subtle">
                              ID: {student.studentId}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      {student.classroom ? (
                        <span className="font-semibold text-foreground">
                          {student.classroom.name}
                        </span>
                      ) : (
                        <span className="text-subtle italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 font-medium text-muted">
                      {student.age} {student.age === 1 ? "yr" : "yrs"}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <span className="text-muted capitalize">
                        {student.gender ?? "Learner"}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      {student.guardians.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
                          <AlertTriangle size={13} />
                          No guardian
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {student.guardians.map((guardian) => (
                            <span key={guardian.parentId} className="text-[11px]">
                              <span className="font-bold text-foreground">
                                {guardian.name}
                              </span>
                              <span className="text-subtle">
                                {" "}
                                (
                                {RELATIONSHIP_LABEL[guardian.relationship] ??
                                  guardian.relationship}
                                )
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Badge tone={student.isActive ? "success" : "danger"}>
                        {student.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(student);
                            setFormOpen(true);
                          }}
                          aria-label={`Edit ${student.fullName}`}
                          className="text-warning hover:bg-warning/10 hover:text-warning"
                        >
                          <Pencil size={16} />
                        </Button>
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(student)}
                            aria-label={`Delete ${student.fullName}`}
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

        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {/* Mounted only while open, and keyed per child: the form seeds its
          guardian rows from props on mount, so a fresh mount is what keeps
          them in step without an effect. */}
      {formOpen && (
        <StudentForm
          key={editing?.id ?? "new"}
          open
          student={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={afterSave}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel="Remove"
        destructive
        title="Remove student"
        description="This deletes the child's record."
      >
        Remove <strong>{deleting?.fullName}</strong>? This cannot be undone. To
        keep the record but mark them as gone, edit the child and untick
        &ldquo;Currently attending&rdquo; instead.
      </ConfirmDialog>
    </>
  );
}

function EmptyRow({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={7}
        className={`px-4 py-10 text-center text-sm ${
          tone === "danger" ? "text-danger" : "text-muted"
        }`}
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
