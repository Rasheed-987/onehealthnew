"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  queryKeys,
  useClassroomPickerQuery,
  useDailyProgressQuery,
  useInvalidate,
  type DailyProgressEntry,
} from "@/hooks/queries";
import { useDismissibleError } from "@/hooks/useDismissibleError";
import { ApiError } from "@/lib/fetchJson";
import { SheetModal } from "./SheetModal";

/**
 * The daily sheets for a room and a day.
 *
 * Staff read the roster endpoint, which lists every enrolled child including
 * the ones nobody has written a sheet for yet. A guardian cannot call that -
 * a whole-room roster is not theirs to see - so they read the plain list
 * endpoint, which the API has already narrowed to their own children.
 *
 * Which of the two is decided by the `canRecord` prop, drawn from the same
 * permission table the routes enforce, exactly as HomeRoomsClient does. It is
 * a rendering decision only: both endpoints scope themselves server-side, so
 * a parent editing this flag in devtools gets a 403 from the roster route
 * rather than another family's children.
 */

/** Today where the user is - `toISOString()` would roll over at 00:00 UTC. */
function todayKey(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function DailyProgressClient({ canRecord }: { canRecord: boolean }) {
  const [date, setDate] = useState(todayKey());
  const [classroom, setClassroom] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<DailyProgressEntry | null>(null);

  const invalidate = useInvalidate();

  // Offers whatever the scoped classroom route returns: every room for an
  // admin, the caller's own rooms for a teacher. Shared with the four other
  // screens carrying this picker, so only the first of them pays for it.
  const classrooms = useClassroomPickerQuery(canRecord).data?.classrooms ?? [];

  // Only the date is debounced - it is the one control someone sweeps through.
  const debouncedDate = useDebouncedValue(date, 200);
  const sheets = useDailyProgressQuery(debouncedDate, classroom, canRecord);
  const { data, isPending } = sheets;

  const entries = data?.entries ?? [];
  const summary = data?.summary ?? null;

  /*
   * A teacher on two or more rooms is asked to choose one - the roster
   * endpoint cannot guess. That is a prompt, not a failure, so the 400's
   * per-field detail is preferred over its headline message.
   */
  const [banner, dismissError] = useDismissibleError(
    sheets,
    "Could not load the sheets.",
  );
  const chooseARoom =
    sheets.error instanceof ApiError
      ? (sheets.error.details?.classroom as string | undefined)
      : undefined;
  const loadError = banner === null ? null : (chooseARoom ?? banner);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Date
          </span>
          <div className="relative">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              type="date"
              value={date}
              max={todayKey()}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
          </div>
        </label>

        {/* A guardian has no classroom picker - they get their own children
            whichever room those children sit in. */}
        {canRecord && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Classroom
            </span>
            <select
              value={classroom}
              onChange={(event) => setClassroom(event.target.value)}
              className="min-w-48 rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            >
              <option value="">Choose a classroom</option>
              {classrooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loadError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-control border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <span>{loadError}</span>
          <button type="button" onClick={dismissError} aria-label="Dismiss">
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

      {summary && summary.total > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Sheets" value={summary.total} />
          <Tile label="Started" value={summary.started} />
          <Tile label="Drinks" value={summary.drinks} />
          <Tile
            label="Nap time"
            value={
              summary.napMinutes > 0 ? `${summary.napMinutes} min` : "-"
            }
          />
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-surface-muted">
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Child</th>
                <th className="px-4 py-3 font-semibold">Drinks</th>
                <th className="px-4 py-3 font-semibold">Mood</th>
                <th className="px-4 py-3 font-semibold">Toilet</th>
                <th className="px-4 py-3 font-semibold">Sleep</th>
                <th className="px-4 py-3 font-semibold">Needs</th>
                <th className="px-4 py-3 text-right font-semibold">Sheet</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <EmptyRow>Loading sheets...</EmptyRow>
              ) : entries.length === 0 ? (
                <EmptyRow>
                  {canRecord && !classroom
                    ? "Choose a classroom to see its sheets."
                    : "Nothing recorded for this day yet."}
                </EmptyRow>
              ) : (
                entries.map((entry) => {
                  const sheet = entry.sheet;
                  const started = sheet && !sheet.isEmpty;
                  return (
                    <tr
                      key={entry.student.id}
                      className="border-t border-border transition-colors hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {entry.student.fullName}
                        </div>
                        {entry.recordedInThisClassroom === false && sheet && (
                          <div className="mt-1">
                            <Badge tone="warning">Moved room today</Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {sheet?.drinks.length || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {sheet && sheet.moodLabels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {sheet.moodLabels.map((label) => (
                              <Badge key={label} tone="success">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {sheet?.toilet.length || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {sheet && sheet.naps.length > 0
                          ? `${sheet.naps.reduce(
                              (m, n) => m + (n.minutes ?? 0),
                              0,
                            )} min`
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {sheet && sheet.needLabels.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {sheet.needLabels.map((label) => (
                              <Badge key={label} tone="warning">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setOpen(entry)}
                          className="rounded-control px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-subtle"
                        >
                          {canRecord
                            ? started
                              ? "Edit"
                              : "Fill in"
                            : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <SheetModal
          key={`${open.student.id}-${date}`}
          studentId={open.student.id}
          studentName={open.student.fullName}
          date={date}
          sheet={open.sheet}
          readOnly={!canRecord}
          onClose={() => setOpen(null)}
          onSaved={(message) => {
            setOpen(null);
            setNotice(message);
            // The week view is a roll-up of exactly these sheets, so writing
            // one makes both screens out of date, not just this one.
            invalidate(
              queryKeys.dailyProgress.all,
              queryKeys.weeklyProgress.all,
            );
          }}
        />
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}
