"use client";

import { useState } from "react";
import { Bell, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import {
  EMPTY_PAGINATION,
  queryKeys,
  useInvalidate,
  useNotificationsQuery,
} from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useDismissibleError } from "@/hooks/useDismissibleError";
import type { NotificationRow } from "@/lib/notifications";
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_AUDIENCE_LABEL,
  type NotificationAudienceKind,
} from "@/models/enums";
import { NotificationForm } from "./NotificationForm";

/**
 * The notice board.
 *
 * Two readings of one endpoint. The super admin gets the table - they need the
 * "For" column, because the audience is the thing they are managing - and
 * everybody else gets the notices themselves, since "who else got this" is not
 * a question a family has any business asking.
 *
 * As everywhere else in the dashboard, no role branching beyond which controls
 * render. `GET /api/notifications` scopes itself: every notice for the admin
 * who wrote them, and for a reader only the ones whose audience reaches them.
 */

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

export function NotificationsClient({ canManage }: { canManage: boolean }) {
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(PER_PAGE_OPTIONS[0]);

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<NotificationRow | null>(null);
  const [deleting, setDeleting] = useState<NotificationRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const invalidate = useInvalidate();

  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useNotificationsQuery({
    kind,
    search: debouncedSearch,
    includeInactive,
    page,
    perPage,
  });

  const rows = query.data?.notifications ?? [];
  const pagination = query.data?.pagination ?? EMPTY_PAGINATION;

  // A failed action and a failed load share the one dismissible line, the
  // action first because it is the thing that just happened.
  const [banner, dismissBanner] = useDismissibleError(
    query,
    "Could not load notifications.",
  );
  const loadError = actionError ?? banner;

  function dismissError() {
    setActionError(null);
    dismissBanner();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const response = await fetch(`/api/notifications/${deleting.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionError(payload.error ?? "Could not withdraw the notification.");
    } else {
      setActionError(null);
      setNotice("Notification withdrawn. Nobody sees it any more.");
    }
    setDeleting(null);
    invalidate(queryKeys.notifications.all);
  }

  /** Puts a withdrawn notice back on the board. */
  async function restore(row: NotificationRow) {
    const response = await fetch(`/api/notifications/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionError(payload.error ?? "Could not restore the notification.");
    } else {
      setActionError(null);
      setNotice("Notification restored.");
    }
    invalidate(queryKeys.notifications.all);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canManage && (
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
        )}

        {/* The audience filter is the admin's index into their own board:
            "what have we sent to families this term". It says nothing useful
            to a reader, who only ever sees notices addressed to them. */}
        {canManage && (
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by audience"
            className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          >
            <option value="">All audiences</option>
            {(
              Object.values(NOTIFICATION_AUDIENCE) as NotificationAudienceKind[]
            ).map((value) => (
              <option key={value} value={value}>
                {NOTIFICATION_AUDIENCE_LABEL[value]}
              </option>
            ))}
          </select>
        )}

        {canManage && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => {
                setIncludeInactive(event.target.checked);
                setPage(1);
              }}
              className="accent-[var(--color-primary,#2f7d4f)]"
            />
            Show withdrawn
          </label>
        )}

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
            placeholder="Search notifications"
            aria-label="Search notifications"
            className="w-full rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Plus size={16} />
            Add Notification
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger">
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

      {canManage ? (
        <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">For</th>
                  <th className="px-4 py-3 font-semibold">Notification</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <EmptyRow colSpan={4}>Loading notifications...</EmptyRow>
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={4}>
                    {search || kind
                      ? "No notifications match those filters."
                      : "No notifications yet. Add the first one."}
                  </EmptyRow>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-border transition-colors hover:bg-surface-hover"
                    >
                      {/* The audience, spelled out. The summary is the row's
                          headline and the chips are the whole list, so an
                          admin never has to open a notice to see who got it. */}
                      <td className="max-w-xs px-4 py-3 align-top">
                        <div className="font-medium text-foreground">
                          {row.audience.label}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {NOTIFICATION_AUDIENCE_LABEL[row.audience.kind]}
                        </div>
                        {row.audience.targets.length > 1 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {row.audience.targets.map((target) => (
                              <Badge key={target.id} tone="neutral">
                                {target.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="w-full max-w-xl px-4 py-3 align-top">
                        {row.title && (
                          <div className="font-medium text-foreground">
                            {row.title}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words text-foreground">
                          {row.body}
                        </p>
                        {!row.isActive && (
                          <span className="mt-1.5 inline-flex">
                            <Badge tone="danger">Withdrawn</Badge>
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top text-muted">
                        <div>{new Date(row.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs">
                          {row.createdBy?.name ?? "Unknown"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditing(row)}
                            className="rounded-control bg-warning px-3 py-1.5 text-sm font-semibold text-charcoal-950 transition-colors hover:opacity-90"
                          >
                            Edit
                          </button>
                          {row.isActive ? (
                            <button
                              type="button"
                              onClick={() => setDeleting(row)}
                              className="rounded-control bg-danger px-3 py-1.5 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover"
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => restore(row)}
                              className="rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
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
                {Math.min(
                  pagination.page * pagination.perPage,
                  pagination.total,
                )}{" "}
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
      ) : (
        <div className="space-y-3">
          {query.isPending ? (
            <EmptyCard>Loading notifications...</EmptyCard>
          ) : rows.length === 0 ? (
            <EmptyCard>
              {search
                ? "No notifications match that."
                : "Nothing from the school yet."}
            </EmptyCard>
          ) : (
            <>
              {rows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-card border border-border bg-surface p-4 shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <Bell size={18} className="mt-0.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      {row.title && (
                        <h3 className="text-sm font-semibold text-foreground">
                          {row.title}
                        </h3>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                        {row.body}
                      </p>
                      <p className="mt-1.5 text-xs text-muted">
                        {new Date(row.createdAt).toLocaleDateString()}
                        {row.createdBy && ` · ${row.createdBy.name}`}
                      </p>
                    </div>
                  </div>
                </article>
              ))}

              {pagination.pageCount > 1 && (
                <div className="flex justify-end gap-2">
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
              )}
            </>
          )}
        </div>
      )}

      {(composing || editing) && (
        <NotificationForm
          notification={editing}
          onClose={() => {
            setComposing(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setComposing(false);
            setEditing(null);
            setNotice(message);
            invalidate(queryKeys.notifications.all);
          }}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Withdraw notification"
        description="It disappears from every board it is on."
      >
        <div className="px-6 py-5 text-sm text-foreground">
          Withdraw the notification sent to{" "}
          <strong>{deleting?.audience.label ?? "this audience"}</strong>? It is
          kept so it can be restored, but nobody will see it any more.
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
            Withdraw
          </button>
        </div>
      </Modal>
    </>
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

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface p-10 text-center text-sm text-muted">
      {children}
    </div>
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
