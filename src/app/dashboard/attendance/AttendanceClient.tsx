"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/Field";
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
  queryKeys,
  useAttendanceQuery,
  useAttendanceRegisterQuery,
  useClassroomPickerQuery,
  useInvalidate,
} from "@/hooks/queries";
import { RegisterModal } from "./RegisterModal";

/**
 * The register, read back.
 *
 * There is deliberately no role branching in here beyond the wording of an
 * empty state. `GET /api/attendance` resolves the scope server-side - the
 * whole school for a super admin, their own rooms for a teacher - and
 * `GET /api/classrooms` is scoped the same way, so the classroom picker can
 * only ever offer rooms the caller may already read.
 *
 * That is the point: if the filtering lived here, "show me everything" would
 * be one edited fetch call away in the browser devtools. The client renders
 * what it is handed.
 */

/** Today where the user is - `toISOString()` would roll over at 00:00 UTC. */
function todayKey(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const STATUS_TONE = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "neutral",
} as const;

export function AttendanceClient({ canRecord = false }: { canRecord?: boolean }) {
  const [date, setDate] = useState(todayKey());
  const [classroom, setClassroom] = useState("");
  const [status, setStatus] = useState("");
  const [takingRegister, setTakingRegister] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const invalidate = useInvalidate();

  // The picker offers whatever the scoped classroom route returns: every room
  // for an admin, the caller's own rooms for a teacher. Nothing to filter here,
  // and nothing to fetch either if another screen has already asked for it.
  const classrooms = useClassroomPickerQuery().data?.classrooms ?? [];

  // Only the date is debounced. It is the one control a person can sweep
  // through - the two dropdowns change once per click, and a filter they have
  // already used comes back from the cache without a request at all.
  const debouncedDate = useDebouncedValue(date, 200);
  const register = useAttendanceQuery(debouncedDate, classroom, status);
  const { data, isPending } = register;

  const records = data?.records ?? [];
  const summary = data?.summary ?? null;
  const scope = data?.scope ?? null;

  // Staff only, and only once a specific room is chosen: the roster for that
  // room and day, so the screen can say how much of the register is still to
  // take. "All classrooms" has no single roster, so this stays disabled.
  const sheet = useAttendanceRegisterQuery(
    debouncedDate,
    classroom,
    canRecord && classroom !== "",
  );
  const roster = sheet.data
    ? {
        total: sheet.data.entries.length,
        marked: sheet.data.entries.length - sheet.data.unmarked,
        unmarked: sheet.data.unmarked,
      }
    : null;
  const roomName =
    classrooms.find((room) => room.id === classroom)?.name ?? "this classroom";
  const [loadError, dismissError] = useDismissibleError(
    register,
    "Could not load the register.",
  );

  /*
   * A teacher posted to no rooms gets an empty scope, which is correct and
   * looks exactly like "nobody marked the register today". Saying which it is
   * saves a support call.
   */
  const hasNoRooms =
    scope?.classroomIds !== null && scope?.classroomIds?.length === 0;

  const emptyMessage = useMemo(() => {
    if (hasNoRooms) {
      return "You are not assigned to any classroom yet, so there is no register to show. Ask an administrator to add you to one.";
    }
    if (status || classroom) {
      return "No register lines match these filters.";
    }
    return "Nobody has been marked for this day yet.";
  }, [hasNoRooms, status, classroom]);

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

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Classroom
          </span>
          <Select
            value={classroom || "__all__"}
            onValueChange={(value) => setClassroom(value === "__all__" ? "" : value)}
          >
            <SelectTrigger className="min-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* "All" means all rooms in scope, not all rooms in the school. */}
              <SelectItem value="__all__">All classrooms</SelectItem>
              {classrooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Status
          </span>
          <Select
            value={status || "__all__"}
            onValueChange={(value) => setStatus(value === "__all__" ? "" : value)}
          >
            <SelectTrigger className="min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="PRESENT">Present</SelectItem>
              <SelectItem value="ABSENT">Absent</SelectItem>
              <SelectItem value="LATE">Late</SelectItem>
              <SelectItem value="EXCUSED">Excused</SelectItem>
            </SelectContent>
          </Select>
        </label>

        {/* Marking is staff-only and needs a specific room - "all classrooms"
            is a report filter, not a roster. The API still re-checks the
            permission and the room, so this is a convenience, not the gate. */}
        {canRecord && (
          <button
            type="button"
            onClick={() => setTakingRegister(true)}
            disabled={!classroom}
            title={classroom ? undefined : "Choose a classroom first"}
            className="flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            <ClipboardList size={16} />
            Take / edit register
          </button>
        )}
      </div>

      {savedNotice && (
        <Notice onDismiss={() => setSavedNotice(null)}>{savedNotice}</Notice>
      )}

      {loadError && (
        <Notice tone="danger" onDismiss={dismissError}>
          {loadError}
        </Notice>
      )}

      {summary && summary.total > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Marked" value={summary.total} />
          <Tile label="Present" value={summary.present} tone="success" />
          <Tile label="Absent" value={summary.absent} tone="danger" />
          <Tile
            label="Attendance"
            value={
              summary.attendanceRate === null
                ? "-"
                : `${summary.attendanceRate}%`
            }
          />
          {/* Only when they actually occur - the register is normally just
              present and absent, and two permanently-zero tiles are noise. */}
          {summary.late > 0 && (
            <Tile label="Late" value={summary.late} tone="warning" />
          )}
          {summary.excused > 0 && (
            <Tile label="Excused" value={summary.excused} />
          )}
        </div>
      )}

      {/* How much of this room's register is done. Only shown to staff who can
          take it, and only for a single room - it is the one place the report
          screen doubles as a worklist. */}
      {canRecord && classroom && roster && roster.total > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-muted px-4 py-3">
          <p className="text-sm text-foreground">
            {roster.unmarked === 0 ? (
              <>Register complete for {roomName} — all {roster.total} marked.</>
            ) : (
              <>
                <span className="font-semibold">{roster.marked}</span> of{" "}
                {roster.total} children marked for {roomName}
                {" — "}
                <span className="text-muted">{roster.unmarked} to go</span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setTakingRegister(true)}
            className="rounded-control border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
          >
            {roster.unmarked === 0 ? "Edit register" : "Continue register"}
          </button>
        </div>
      )}

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                <TableHead className="px-4 py-3 font-semibold">Child</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Classroom</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Status</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Note</TableHead>
                <TableHead className="px-4 py-3 font-semibold">Recorded by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <EmptyRow>Loading the register...</EmptyRow>
              ) : records.length === 0 ? (
                <EmptyRow>
                  {canRecord && classroom && !status ? (
                    <div className="flex flex-col items-center gap-3">
                      <span>
                        No register taken for {roomName} on {date} yet.
                      </span>
                      <button
                        type="button"
                        onClick={() => setTakingRegister(true)}
                        className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                      >
                        <ClipboardList size={16} />
                        Take the register
                      </button>
                    </div>
                  ) : (
                    emptyMessage
                  )}
                </EmptyRow>
              ) : (
                records.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 py-3 font-medium text-foreground">
                      {row.student.fullName}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted">
                      {row.classroom?.name ?? "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status]}>
                        {row.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted">{row.note ?? "-"}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">
                      {row.recordedBy?.name ?? "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {takingRegister && classroom && (
        <RegisterModal
          key={`${classroom}-${date}`}
          classroomId={classroom}
          classroomName={roomName}
          date={date}
          onClose={() => setTakingRegister(false)}
          onSaved={(message) => {
            setTakingRegister(false);
            setSavedNotice(message);
            // The register list and the sheet both read these lines.
            invalidate(queryKeys.attendance.all);
          }}
        />
      )}
    </>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "danger" | "warning";
}) {
  const tones = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
  } as const;
  return (
    <Card className="card-soft">
      <CardContent className="px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={`mt-1 font-display text-2xl font-bold ${
            tone ? tones[tone] : "text-foreground"
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </TableCell>
    </TableRow>
  );
}
