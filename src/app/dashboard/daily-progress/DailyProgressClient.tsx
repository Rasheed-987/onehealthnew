"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import type { DailyProgressRow, ProgressSummary } from "@/lib/dailyProgress";
import type { ClassroomRow } from "@/lib/classrooms";
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

interface Entry {
  student: { id: string; fullName: string; age?: number };
  sheet: DailyProgressRow | null;
  recordedInThisClassroom?: boolean;
}

/** Today where the user is - `toISOString()` would roll over at 00:00 UTC. */
function todayKey(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function DailyProgressClient({ canRecord }: { canRecord: boolean }) {
  const [date, setDate] = useState(todayKey());
  const [classroom, setClassroom] = useState("");
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<Entry | null>(null);

  // Offers whatever the scoped classroom route returns: every room for an
  // admin, the caller's own rooms for a teacher.
  useEffect(() => {
    if (!canRecord) return;
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
  }, [canRecord]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ date });
      if (classroom) params.set("classroom", classroom);

      const url = canRecord
        ? `/api/daily-progress/sheets?${params}`
        : `/api/daily-progress?${params}`;
      const response = await fetch(url);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        /*
         * A teacher on two or more rooms is asked to choose one - the roster
         * endpoint cannot guess. That is a prompt, not a failure.
         */
        setLoadError(
          payload.details?.classroom ??
            payload.error ??
            "Could not load the sheets.",
        );
        setEntries([]);
        setSummary(null);
        return;
      }

      setEntries(
        canRecord
          ? (payload.entries ?? [])
          : // The list endpoint returns sheets, not roster rows. Reshape so
            // the table below renders one way for both roles.
            (payload.records ?? []).map((row: DailyProgressRow) => ({
              student: row.student,
              sheet: row,
            })),
      );
      setSummary(payload.summary ?? null);
    } catch {
      setLoadError("Could not reach the server.");
      setEntries([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [date, classroom, canRecord]);

  // Deferred rather than called straight from the effect body: a synchronous
  // setState there cascades a second render, and the delay coalesces the burst
  // of changes from clicking through a date picker.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

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
              {loading ? (
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
            void load();
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
