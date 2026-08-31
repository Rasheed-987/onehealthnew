"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Notice } from "@/components/dashboard/Notice";
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
            <Input
              type="date"
              value={date}
              max={todayKey()}
              onChange={(event) => setDate(event.target.value)}
              className="w-auto pl-9"
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
            <Select
              value={classroom || "__none__"}
              onValueChange={(value) =>
                setClassroom(value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger className="min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose a classroom</SelectItem>
                {classrooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      {loadError && (
        <Notice tone="danger" onDismiss={dismissError}>
          {loadError}
        </Notice>
      )}
      {notice && <Notice onDismiss={() => setNotice(null)}>{notice}</Notice>}

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

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                <TableHead className="px-4 py-3 font-semibold">Child</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Drinks</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Mood</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Toilet</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Sleep</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Needs</TableHead>
                <TableHead className="px-4 py-3 text-right font-semibold">Sheet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                    <TableRow key={entry.student.id}>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {entry.student.fullName}
                        </div>
                        {entry.recordedInThisClassroom === false && sheet && (
                          <div className="mt-1">
                            <Badge tone="warning">Moved room today</Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted">
                        {sheet?.drinks.length || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
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
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted">
                        {sheet?.toilet.length || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted">
                        {sheet && sheet.naps.length > 0
                          ? `${sheet.naps.reduce(
                              (m, n) => m + (n.minutes ?? 0),
                              0,
                            )} min`
                          : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
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
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpen(entry)}
                          className="text-primary hover:bg-primary-subtle hover:text-primary"
                        >
                          {canRecord
                            ? started
                              ? "Edit"
                              : "Fill in"
                            : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
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
    <Card className="card-soft">
      <CardContent className="px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 font-display text-2xl font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </TableCell>
    </TableRow>
  );
}
