"use client";

import { Badge } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import {
  formatMinutes,
  type WeeklyChildRow,
  type WeeklyDayCell,
} from "@/lib/weeklyProgress";

/**
 * One child's week, opened out.
 *
 * Read-only, and that is the design rather than an omission: the record of
 * truth is the daily sheet, so a week that reads wrong is wrong on a
 * particular day and is fixed there, on Daily Progress. An edit control here
 * would have to guess which day the teacher meant.
 *
 * Everything shown is already on the row the table rendered - the roll-up
 * carries the per-day detail with it - so opening this costs no request.
 */

export function WeekModal({
  child,
  weekLabel,
  onClose,
}: {
  child: WeeklyChildRow;
  weekLabel: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={child.student.fullName}
      description={`${weekLabel}${
        child.classroom ? ` - ${child.classroom.name}` : ""
      }`}
      width="max-w-2xl"
    >
      <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Days recorded" value={`${child.daysRecorded} of 7`} />
          <Stat label="Drinks" value={child.drinks || "-"} />
          <Stat label="Changes" value={child.toiletChanges || "-"} />
          <Stat
            label="Nap"
            value={
              child.napMinutes > 0 ? formatMinutes(child.napMinutes) : "-"
            }
            hint={
              child.averageNapMinutes
                ? `${formatMinutes(child.averageNapMinutes)} a day`
                : undefined
            }
          />
        </div>

        {child.moodTally.length > 0 && (
          <Section title="How they were">
            <div className="flex flex-wrap gap-1.5">
              {child.moodTally.map((mood) => (
                <Badge key={mood.mood} tone="success">
                  {mood.label}
                  {mood.count > 1 && ` x${mood.count}`}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {child.needs.length > 0 && (
          <Section title="Please send in">
            <ul className="space-y-1 text-sm text-foreground">
              {child.needs.map((need) => (
                <li key={need.need} className="flex items-center gap-2">
                  <Badge tone="warning">{need.label}</Badge>
                  <span className="text-xs text-muted">
                    asked for on{" "}
                    {need.days
                      .map((day) => weekdayOf(child.days, day))
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {child.highlights.length > 0 && (
          <Section title="What they got up to">
            <ul className="space-y-1.5 text-sm text-foreground">
              {child.highlights.map((item, index) => (
                <li key={`${item.date}-${index}`} className="flex gap-2">
                  <span className="w-9 shrink-0 text-xs font-semibold uppercase text-muted">
                    {item.weekday}
                  </span>
                  <span>{item.line}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {child.notes.length > 0 && (
          <Section title="Notes from the room">
            <ul className="space-y-2 text-sm text-foreground">
              {child.notes.map((item) => (
                <li
                  key={item.date}
                  className="rounded-control border border-border bg-surface-muted px-3 py-2"
                >
                  <span className="text-xs font-semibold uppercase text-muted">
                    {item.weekday}
                  </span>
                  <p className="mt-0.5">{item.note}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Day by day">
          <ul className="divide-y divide-border rounded-control border border-border">
            {child.days.map((day) => (
              <li key={day.date} className="flex gap-3 px-3 py-2.5">
                <div className="w-16 shrink-0">
                  <div className="text-sm font-semibold text-foreground">
                    {day.weekday}
                  </div>
                  <div className="text-xs text-muted tabular-nums">
                    {day.date.slice(8)}/{day.date.slice(5, 7)}
                  </div>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  {day.started ? (
                    <span className="text-foreground">{describe(day)}</span>
                  ) : (
                    <span className="text-subtle">Nothing recorded</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="flex justify-end border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

/** "2 drinks, 1 change, 1h 30m nap, Happy" - the day in one line. */
function describe(day: WeeklyDayCell): string {
  const parts = [
    day.drinks > 0 && `${day.drinks} drink${day.drinks === 1 ? "" : "s"}`,
    day.toilet > 0 && `${day.toilet} change${day.toilet === 1 ? "" : "s"}`,
    day.napMinutes > 0 && `${formatMinutes(day.napMinutes)} nap`,
    ...day.moodLabels,
  ].filter(Boolean);
  // A sheet can be "started" on a note alone, with every section still empty.
  return parts.length > 0 ? parts.join(", ") : "Note only";
}

/** The weekday name for a date key, read back off the row's own seven days. */
function weekdayOf(days: WeeklyDayCell[], date: string): string {
  return days.find((day) => day.date === date)?.weekday ?? date;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-control border border-border bg-surface-muted px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold text-foreground tabular-nums">
        {value}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
