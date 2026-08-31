"use client";

import { useState } from "react";
import { Bell, Plus } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
        )}

        {/* The audience filter is the admin's index into their own board:
            "what have we sent to families this term". It says nothing useful
            to a reader, who only ever sees notices addressed to them. */}
        {canManage && (
          <Select
            value={kind || "__all__"}
            onValueChange={(value) => {
              setKind(value === "__all__" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-auto" aria-label="Filter by audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All audiences</SelectItem>
              {(
                Object.values(NOTIFICATION_AUDIENCE) as NotificationAudienceKind[]
              ).map((value) => (
                <SelectItem key={value} value={value}>
                  {NOTIFICATION_AUDIENCE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {canManage && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(checked) => {
                setIncludeInactive(checked === true);
                setPage(1);
              }}
            />
            Show withdrawn
          </label>
        )}

        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search notifications"
          aria-label="Search notifications"
          className="ml-auto min-w-56 sm:max-w-xs sm:flex-none"
        />

        {canManage && (
          <Button type="button" onClick={() => setComposing(true)}>
            <Plus size={16} />
            Add Notification
          </Button>
        )}
      </div>

      {loadError && (
        <Notice tone="danger" onDismiss={dismissError}>
          {loadError}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {canManage ? (
        <div className="card-soft overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                  <TableHead className="px-4 py-3 font-semibold">For</TableHead>
                  <TableHead className="px-4 py-3 font-semibold">Notification</TableHead>
                  <TableHead className="px-4 py-3 font-semibold">Sent</TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                    <TableRow key={row.id}>
                      {/* The audience, spelled out. The summary is the row's
                          headline and the chips are the whole list, so an
                          admin never has to open a notice to see who got it. */}
                      <TableCell className="max-w-xs px-4 py-3 align-top">
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
                      </TableCell>
                      <TableCell className="w-full max-w-xl px-4 py-3 align-top">
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
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-4 py-3 align-top text-muted">
                        <div>{new Date(row.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs">
                          {row.createdBy?.name ?? "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right align-top">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-warning text-warning-foreground hover:bg-warning-hover"
                            onClick={() => setEditing(row)}
                          >
                            Edit
                          </Button>
                          {row.isActive ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleting(row)}
                            >
                              Delete
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => restore(row)}
                            >
                              Restore
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
                <Card key={row.id} className="card-soft">
                  <CardContent className="flex items-start gap-3 p-4">
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
                  </CardContent>
                </Card>
              ))}

              {pagination.pageCount > 1 && (
                <Pagination pagination={pagination} onPageChange={setPage} />
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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        confirmLabel="Withdraw"
        destructive
        title="Withdraw notification"
        description="It disappears from every board it is on."
      >
        Withdraw the notification sent to{" "}
        <strong>{deleting?.audience.label ?? "this audience"}</strong>? It is
        kept so it can be restored, but nobody will see it any more.
      </ConfirmDialog>
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

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-soft border-dashed p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}
