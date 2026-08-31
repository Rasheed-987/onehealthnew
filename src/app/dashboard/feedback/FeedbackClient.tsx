"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  EMPTY_PAGINATION,
  queryKeys,
  useFeedbackQuery,
  useInvalidate,
} from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDismissibleError } from "@/hooks/useDismissibleError";
import type { FeedbackRow } from "@/lib/feedback";
import {
  FEEDBACK_EXPERIENCE,
  FEEDBACK_EXPERIENCE_LABEL,
} from "@/models/enums";
import { FeedbackForm } from "./FeedbackForm";
import { formatSubmittedAt } from "./formatSubmittedAt";
import { Stars } from "./Stars";

/**
 * The feedback table.
 *
 * One component for both readers, because the two views differ only in which
 * columns are worth drawing - the rows themselves are the same shape and come
 * from the same endpoint. `GET /api/feedback` scopes itself: every row for the
 * super admin, and for a guardian only their own submissions. Nothing is
 * filtered here, and the two props below only decide which controls render.
 *
 * Sorting, paging and searching are all server-side, so the header arrows and
 * the "Show N entries" box change the request rather than re-ordering what
 * happens to be on screen - the difference matters as soon as there is more
 * than one page.
 */

/** Matches `SORTABLE` in the route. `user` is absent there; see the note. */
type SortKey = "createdAt" | "stars" | "experience" | "comment";

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export function FeedbackClient({
  canSubmit,
  canDelete,
}: {
  canSubmit: boolean;
  canDelete: boolean;
}) {
  const [search, setSearch] = useState("");
  const [experience, setExperience] = useState("");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PER_PAGE_OPTIONS[0]);

  const [composing, setComposing] = useState(false);
  const [deleting, setDeleting] = useState<FeedbackRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidate = useInvalidate();

  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useFeedbackQuery({
    search: debouncedSearch,
    experience,
    sort,
    order,
    page,
    perPage,
  });

  const rows = query.data?.feedback ?? [];
  const summary = query.data?.summary ?? null;
  const pagination = query.data?.pagination ?? EMPTY_PAGINATION;

  // A failed delete and a failed load share the one dismissible line, the
  // delete first because it is the thing that just happened.
  const [banner, dismissBanner] = useDismissibleError(
    query,
    "Could not load feedback.",
  );
  const loadError = deleteError ?? banner;

  function dismissError() {
    setDeleteError(null);
    dismissBanner();
  }

  /**
   * Clicking a header sorts by it, clicking it again reverses. A new column
   * starts descending, which is the useful direction for all four of them -
   * newest first, best rated first.
   */
  function sortBy(key: SortKey) {
    if (sort === key) {
      setOrder((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder("desc");
    }
    // Page 3 of one ordering has nothing to do with page 3 of another.
    setPage(1);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/feedback/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setDeleteError(payload.error ?? "Could not delete this feedback.");
    } else {
      setDeleteError(null);
      setNotice("Feedback deleted.");
    }
    setDeleting(null);
    invalidate(queryKeys.feedback.all);
  }

  // The submitter column says nothing to a guardian reading their own rows.
  const showUser = !canSubmit;
  const columns = 4 + (showUser ? 1 : 0) + (canDelete ? 1 : 0);

  return (
    <>
      {summary && summary.total > 0 && showUser && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <SummaryChip label="Total" value={String(summary.total)} />
          <SummaryChip
            label="Average"
            value={
              summary.averageStars === null
                ? "-"
                : `${summary.averageStars} / 5`
            }
          />
          {Object.values(FEEDBACK_EXPERIENCE).map((value) => (
            <SummaryChip
              key={value}
              label={FEEDBACK_EXPERIENCE_LABEL[value]}
              value={String(summary.byExperience[value] ?? 0)}
            />
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          Show
          <Select
            value={String(perPage)}
            onValueChange={(value) => {
              setPerPage(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-auto" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          entries
        </label>

        <Select
          value={experience || "__all__"}
          onValueChange={(value) => {
            setExperience(value === "__all__" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-auto" aria-label="Filter by experience">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All experiences</SelectItem>
            {Object.values(FEEDBACK_EXPERIENCE).map((value) => (
              <SelectItem key={value} value={value}>
                {FEEDBACK_EXPERIENCE_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={
            showUser ? "Search feedback or name" : "Search your feedback"
          }
          aria-label="Search feedback"
          className="ml-auto min-w-56 sm:max-w-xs sm:flex-none"
        />

        {canSubmit && (
          <Button type="button" onClick={() => setComposing(true)}>
            Share feedback
          </Button>
        )}
      </div>

      {loadError && (
        <Notice tone="danger" onDismiss={dismissError}>
          {loadError}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                {showUser && <TableHead className="px-4 py-3 font-semibold">User</TableHead>}
                <SortableHeader
                  label="Experience"
                  column="experience"
                  sort={sort}
                  order={order}
                  onSort={sortBy}
                />
                <SortableHeader
                  label="Feedback"
                  column="comment"
                  sort={sort}
                  order={order}
                  onSort={sortBy}
                />
                <SortableHeader
                  label="Stars"
                  column="stars"
                  sort={sort}
                  order={order}
                  onSort={sortBy}
                />
                <SortableHeader
                  label="Submitted at"
                  column="createdAt"
                  sort={sort}
                  order={order}
                  onSort={sortBy}
                />
                {canDelete && (
                  <TableHead className="px-4 py-3 text-right font-semibold">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                <EmptyRow colSpan={columns}>Loading feedback...</EmptyRow>
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={columns}>
                  {search || experience
                    ? "No feedback matches those filters."
                    : canSubmit
                      ? "You have not left any feedback yet."
                      : "No families have left feedback yet."}
                </EmptyRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {showUser && (
                      <TableCell className="px-4 py-3">
                        {row.user ? (
                          <>
                            <div className="font-medium text-foreground">
                              {row.user.name}
                            </div>
                            <div className="text-xs text-muted">
                              {row.user.email}
                            </div>
                          </>
                        ) : (
                          // The row outlives the account that left it.
                          <span className="text-muted">N/A</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="px-4 py-3 text-muted">
                      {row.experienceLabel}
                    </TableCell>
                    {/* The column the reader actually came for: given the room
                        to be read, and wrapped rather than truncated. */}
                    <TableCell className="w-full max-w-xl px-4 py-3 text-foreground">
                      <p className="whitespace-pre-wrap break-words">
                        {row.comment}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Stars value={row.stars} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatSubmittedAt(row.createdAt)}
                    </TableCell>
                    {canDelete && (
                      <TableCell className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleting(row)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {composing && (
        <FeedbackForm
          onClose={() => setComposing(false)}
          onSaved={(message) => {
            setComposing(false);
            setNotice(message);
            invalidate(queryKeys.feedback.all);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel="Delete"
        destructive
        title="Delete feedback"
        description="This removes the comment permanently."
      >
        Delete the feedback from{" "}
        <strong>{deleting?.user?.name ?? "this family"}</strong>? Unlike a
        gallery post this is not recoverable - there is no archived copy to
        restore it from.
      </ConfirmDialog>
    </>
  );
}

/**
 * A header that sorts. The arrow is the state: a neutral pair while the column
 * is unsorted, one arrow once it is - which is also what `aria-sort` announces,
 * so the control does not rely on the glyph alone.
 */
function SortableHeader({
  label,
  column,
  sort,
  order,
  onSort,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  order: "asc" | "desc";
  onSort: (column: SortKey) => void;
}) {
  const active = sort === column;
  const Icon = !active
    ? ChevronsUpDown
    : order === "asc"
      ? ChevronUp
      : ChevronDown;

  return (
    <TableHead
      className="px-4 py-3 font-semibold"
      aria-sort={
        active ? (order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground"
      >
        {label}
        <Icon
          size={13}
          className={active ? "text-primary" : "text-subtle"}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-control border border-border bg-surface px-3 py-1.5">
      <span className="text-muted">{label}: </span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function EmptyRow({
  children,
  colSpan,
}: {
  children: React.ReactNode;
  colSpan: number;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className="px-4 py-10 text-center text-sm text-muted"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
