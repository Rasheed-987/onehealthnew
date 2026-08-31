"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
import { useDismissibleError } from "@/hooks/useDismissibleError";
import {
  useClassroomPickerQuery,
  useWeeklyProgressQuery,
} from "@/hooks/queries";
import { formatMinutes, type WeeklyChildRow } from "@/lib/weeklyProgress";
import { WeekModal } from "./WeekModal";

/**
 * A week of daily sheets, one row per child.
 *
 * The seven squares are the screen. A number in a totals column tells you a
 * child drank four times this week; the strip tells you those four were all on
 * Monday and nobody has written anything since - which is the thing worth
 * knowing and the thing a total hides.
 *
 * No role branching beyond which controls render. `GET /api/weekly-progress`
 * scopes itself: the whole school for an admin, their rooms for a teacher, and
 * for a guardian only their own children.
 */

const DAY_MS = 86_400_000;

/** Monday of the local week, in the same "YYYY-MM-DD" form the API speaks. */
function thisWeekStart(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  const offset = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

function shiftWeeks(key: string, weeks: number): string {
  return new Date(Date.parse(key) + weeks * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function WeeklyProgressClient({ canRecord }: { canRecord: boolean }) {
  const [week, setWeek] = useState(thisWeekStart);
  const [classroom, setClassroom] = useState("");
  const [open, setOpen] = useState<WeeklyChildRow | null>(null);

  // Offers whatever the scoped classroom route returns: every room for an
  // admin, the caller's own rooms for a teacher. Shared through the cache with
  // the other screens that carry this picker.
  const classrooms = useClassroomPickerQuery(canRecord).data?.classrooms ?? [];

  // Debounced to coalesce the burst from clicking quickly back through several
  // weeks. Landing on one already visited is then a cache read, not a request.
  const debouncedWeek = useDebouncedValue(week, 200);
  const weekQuery = useWeeklyProgressQuery(debouncedWeek, classroom);
  const { data, isPending } = weekQuery;

  const children = data?.children ?? [];
  const meta = data?.week ?? null;
  const summary = data?.summary ?? null;
  const [loadError, dismissError] = useDismissibleError(
    weekQuery,
    "Could not load the week.",
  );

  // The current week is as far forward as it is worth going - the days after
  // today in it are already visible, and everything past it is empty.
  const atCurrentWeek = week >= thisWeekStart();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Week
          </span>
          <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setWeek(shiftWeeks(week, -1))}
              aria-label="Previous week"
              className="h-8 w-8 text-muted"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="min-w-44 px-2 text-center text-sm font-medium text-foreground">
              {meta?.label ?? week}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setWeek(shiftWeeks(week, 1))}
              disabled={atCurrentWeek}
              aria-label="Next week"
              className="h-8 w-8 text-muted"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Jump to
          </span>
          <Input
            type="date"
            value={week}
            max={thisWeekStart()}
            // Any day snaps back to its Monday server-side, so a teacher can
            // pick the Thursday they remember rather than counting back.
            onChange={(event) =>
              event.target.value && setWeek(event.target.value)
            }
            className="w-auto"
          />
        </label>

        {/* A guardian has no classroom picker - they get their own children
            whichever room those children sit in. */}
        {canRecord && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Classroom
            </span>
            <Select
              value={classroom || "__all__"}
              onValueChange={(value) =>
                setClassroom(value === "__all__" ? "" : value)
              }
            >
              <SelectTrigger className="min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All my classrooms</SelectItem>
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

      {summary && summary.children > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Children"
            value={summary.children}
            hint={`${summary.childrenRecorded} written up`}
          />
          <Tile
            label="Sheets this week"
            value={summary.daysRecorded}
            hint={`of ${summary.children * 7} child-days`}
          />
          <Tile
            label="Nap time"
            value={
              summary.napMinutes > 0 ? formatMinutes(summary.napMinutes) : "-"
            }
            hint="across the week"
          />
          {/* The one number worth acting on, so it is coloured when it is not
              zero rather than sitting quietly among the others. */}
          <Tile
            label="Nothing recorded"
            value={summary.untouched}
            hint={summary.untouched > 0 ? "children with a blank week" : "all up to date"}
            alarming={summary.untouched > 0}
          />
        </div>
      )}

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                <TableHead className="px-4 py-3 font-semibold">Child</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Mon - Sun</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Drinks</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Nap</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Mood</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Needs</TableHead>
                <TableHead className="px-4 py-3 text-right font-semibold">Week</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <EmptyRow>Loading the week...</EmptyRow>
              ) : children.length === 0 ? (
                <EmptyRow>
                  {canRecord
                    ? "No sheets were written this week. Pick a classroom to see who is missing."
                    : "Nothing was recorded for your children this week."}
                </EmptyRow>
              ) : (
                children.map((child) => (
                  <TableRow key={child.student.id}>
                    <TableCell className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {child.student.fullName}
                      </div>
                      {child.classroom && (
                        <div className="text-xs text-muted">
                          {child.classroom.name}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      <DayStrip child={child} />
                    </TableCell>

                    <TableCell className="px-4 py-3 text-muted tabular-nums">
                      {child.drinks || "-"}
                    </TableCell>

                    <TableCell className="px-4 py-3 text-muted tabular-nums">
                      {child.napMinutes > 0
                        ? formatMinutes(child.napMinutes)
                        : "-"}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      {child.topMood ? (
                        <Badge tone="success">
                          {child.topMood.label}
                          {child.topMood.count > 1 && ` x${child.topMood.count}`}
                        </Badge>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </TableCell>

                    <TableCell className="px-4 py-3">
                      {child.needs.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {child.needs.map((need) => (
                            <Badge key={need.need} tone="warning">
                              {need.label}
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
                        onClick={() => setOpen(child)}
                        className="text-primary hover:bg-primary-subtle hover:text-primary"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {open && meta && (
        <WeekModal
          child={open}
          weekLabel={meta.label}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * Seven squares, Monday to Sunday.
 *
 * A filled square means something was written that day; a hollow one means
 * nobody opened the sheet. The pattern is the information - four filled days
 * running is a different story from four scattered ones, and no column of
 * totals can tell them apart.
 */
function DayStrip({ child }: { child: WeeklyChildRow }) {
  return (
    <div className="flex gap-1">
      {child.days.map((day) => {
        const parts = [
          day.drinks > 0 && `${day.drinks} drink${day.drinks === 1 ? "" : "s"}`,
          day.toilet > 0 && `${day.toilet} change${day.toilet === 1 ? "" : "s"}`,
          day.napMinutes > 0 && `${formatMinutes(day.napMinutes)} nap`,
          ...day.moodLabels,
        ].filter(Boolean);

        return (
          <span
            key={day.date}
            // A native title rather than a tooltip component: this is a
            // hover-only detail on a table already dense with them.
            title={`${day.weekday} ${day.date}${
              parts.length > 0 ? ` - ${parts.join(", ")}` : " - nothing recorded"
            }`}
            className={`flex h-7 w-7 items-center justify-center rounded-control text-[10px] font-semibold ${
              day.started
                ? "bg-primary-subtle text-primary-active"
                : "border border-dashed border-border-strong text-subtle"
            }`}
          >
            {day.weekday.charAt(0)}
          </span>
        );
      })}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  alarming = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  alarming?: boolean;
}) {
  return (
    <Card className="card-soft">
      <CardContent className="px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={`mt-1 font-display text-2xl font-bold tabular-nums ${
            alarming ? "text-danger" : "text-foreground"
          }`}
        >
          {value}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
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
