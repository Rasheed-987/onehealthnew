"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, X } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
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
          <select
            value={perPage}
            onChange={(event) => {
              setPerPage(Number(event.target.value));
              setPage(1);
            }}
            aria-label="Rows per page"
            className="rounded-control border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          entries
        </label>

        <select
          value={experience}
          onChange={(event) => {
            setExperience(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by experience"
          className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          <option value="">All experiences</option>
          {Object.values(FEEDBACK_EXPERIENCE).map((value) => (
            <option key={value} value={value}>
              {FEEDBACK_EXPERIENCE_LABEL[value]}
            </option>
          ))}
        </select>

        <div className="relative ml-auto min-w-56 flex-1 sm:max-w-xs sm:flex-none">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
          />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={
              showUser ? "Search feedback or name" : "Search your feedback"
            }
            aria-label="Search feedback"
            className="w-full rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>

        {canSubmit && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Share feedback
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">
          <span>{loadError}</span>
          <button type="button" onClick={dismissError} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-primary/25 bg-primary-subtle px-3 py-2 text-sm text-primary-active">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-xs uppercase tracking-wide text-muted">
                {showUser && <th className="px-4 py-3 font-semibold">User</th>}
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
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
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
                  <tr
                    key={row.id}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    {showUser && (
                      <td className="px-4 py-3">
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
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted">
                      {row.experienceLabel}
                    </td>
                    {/* The column the reader actually came for: given the room
                        to be read, and wrapped rather than truncated. */}
                    <td className="w-full max-w-xl px-4 py-3 text-foreground">
                      <p className="whitespace-pre-wrap break-words">
                        {row.comment}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Stars value={row.stars} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatSubmittedAt(row.createdAt)}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleting(row)}
                          className="rounded-control bg-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
            <span>
              Showing {(pagination.page - 1) * pagination.perPage + 1} to{" "}
              {Math.min(pagination.page * pagination.perPage, pagination.total)}{" "}
              of {pagination.total} entries
            </span>
            <div className="flex gap-2">
              <PageButton
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </PageButton>
              <PageButton
                disabled={pagination.page >= pagination.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </PageButton>
            </div>
          </div>
        )}
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

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete feedback"
        description="This removes the comment permanently."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Delete the feedback from{" "}
          <strong>{deleting?.user?.name ?? "this family"}</strong>? Unlike a
          gallery post this is not recoverable - there is no archived copy to
          restore it from.
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
            Delete
          </button>
        </div>
      </Modal>
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
    <th
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
    </th>
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
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-10 text-center text-sm text-muted"
      >
        {children}
      </td>
    </tr>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
