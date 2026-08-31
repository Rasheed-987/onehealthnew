"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { AudienceOptions } from "@/lib/notifications";
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_AUDIENCE_LABEL,
  type NotificationAudienceKind,
  type NotificationRoleTarget,
} from "@/models/enums";

/**
 * The "For" field.
 *
 * The version this replaces was one scrolling multi-select holding "All",
 * "Parent", "Teacher" and then every teacher by name. Three things were wrong
 * with it and all three are structural rather than cosmetic: the list grows
 * without bound as the school hires and enrols, it lets you pick combinations
 * that have no meaning ("All" and one teacher at once), and it tells you
 * nothing about how far a choice reaches until after you have sent it.
 *
 * So the audience is chosen in two steps. First the KIND - which is the same
 * four the API stores and the reader's scope filter branches on - and then,
 * inside that kind, the specific targets. One kind at a time is what makes the
 * meaningless combinations unrepresentable rather than merely discouraged.
 *
 * Every option carries its reach, because the difference between a notice for
 * fourteen families and one for the whole nursery is the single most useful
 * thing to know before pressing send.
 */

export type AudienceValue =
  | { kind: typeof NOTIFICATION_AUDIENCE.ALL }
  | { kind: typeof NOTIFICATION_AUDIENCE.ROLE; roles: NotificationRoleTarget[] }
  | { kind: typeof NOTIFICATION_AUDIENCE.CLASSROOM; classrooms: string[] }
  | { kind: typeof NOTIFICATION_AUDIENCE.STUDENT; students: string[] };

/**
 * The selections for all four kinds at once.
 *
 * Held together rather than one list at a time so that clicking "Classrooms",
 * looking at the rooms, and clicking back to "Specific children" does not
 * silently throw away the children already ticked. Only the active kind is
 * ever emitted - the model refuses a notice carrying anyone else's list - so
 * this is a convenience for the person filling the form, not a second source
 * of truth.
 */
export interface Draft {
  kind: NotificationAudienceKind;
  roles: NotificationRoleTarget[];
  classrooms: string[];
  students: string[];
}

export function draftFromValue(value: AudienceValue): Draft {
  return {
    kind: value.kind,
    roles: value.kind === NOTIFICATION_AUDIENCE.ROLE ? value.roles : [],
    classrooms:
      value.kind === NOTIFICATION_AUDIENCE.CLASSROOM ? value.classrooms : [],
    students: value.kind === NOTIFICATION_AUDIENCE.STUDENT ? value.students : [],
  };
}

/** The one list the active kind owns, as the API expects it. */
export function valueFromDraft(draft: Draft): AudienceValue {
  switch (draft.kind) {
    case NOTIFICATION_AUDIENCE.ROLE:
      return { kind: draft.kind, roles: draft.roles };
    case NOTIFICATION_AUDIENCE.CLASSROOM:
      return { kind: draft.kind, classrooms: draft.classrooms };
    case NOTIFICATION_AUDIENCE.STUDENT:
      return { kind: draft.kind, students: draft.students };
    default:
      return { kind: NOTIFICATION_AUDIENCE.ALL };
  }
}

const KIND_HINT: Record<NotificationAudienceKind, string> = {
  ALL: "Every guardian and every member of staff.",
  ROLE: "All parents, all teachers, or both.",
  CLASSROOM: "The staff posted to a room, and the families of the children in it.",
  STUDENT: "The guardians of the children you name. Staff do not see it.",
};

export function AudiencePicker({
  draft,
  onChange,
  options,
  loading,
  error,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  options: AudienceOptions | undefined;
  loading: boolean;
  error?: string;
}) {
  const [studentSearch, setStudentSearch] = useState("");

  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value];

  /*
   * Children matching the search box, still under their room headings. An
   * empty group is dropped rather than left as a heading with nothing beneath
   * it, which is what made the old flat list hard to read at three hundred
   * names.
   */
  const studentGroups = useMemo(() => {
    const groups = options?.studentGroups ?? [];
    const term = studentSearch.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        students: group.students.filter(
          (student) =>
            student.fullName.toLowerCase().includes(term) ||
            student.guardians.some((name) =>
              name.toLowerCase().includes(term),
            ) ||
            (group.classroom?.name ?? "").toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.students.length > 0);
  }, [options, studentSearch]);

  const reach = useMemo(
    () => describeReach(draft, options),
    [draft, options],
  );

  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">
        Who is this for<span className="ml-0.5 text-danger">*</span>
      </legend>

      {/* Step one: the category. */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(
          Object.values(NOTIFICATION_AUDIENCE) as NotificationAudienceKind[]
        ).map((kind) => (
          <label
            key={kind}
            className={`flex cursor-pointer gap-3 rounded-control border px-3 py-2.5 transition-colors ${
              draft.kind === kind
                ? "border-primary bg-primary-subtle"
                : "border-border-strong bg-surface hover:bg-surface-hover"
            }`}
          >
            <input
              type="radio"
              name="audience-kind"
              checked={draft.kind === kind}
              onChange={() => set({ kind })}
              className="mt-1 accent-[var(--color-primary,#2f7d4f)]"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {NOTIFICATION_AUDIENCE_LABEL[kind]}
              </span>
              <span className="block text-xs text-muted">{KIND_HINT[kind]}</span>
            </span>
          </label>
        ))}
      </div>

      {/* Step two: who, inside that category. */}
      <div className="mt-3">
        {loading && !options ? (
          <p className="text-sm text-muted">Loading the school roll...</p>
        ) : draft.kind === NOTIFICATION_AUDIENCE.ROLE ? (
          <div className="space-y-2">
            {(options?.roles ?? []).map((role) => (
              <CheckRow
                key={role.value}
                checked={draft.roles.includes(role.value)}
                onToggle={() => set({ roles: toggle(draft.roles, role.value) })}
                label={role.label}
                detail={`${role.recipients} ${
                  role.recipients === 1 ? "account" : "accounts"
                }`}
              />
            ))}
          </div>
        ) : draft.kind === NOTIFICATION_AUDIENCE.CLASSROOM ? (
          <div className="space-y-2">
            <GroupToolbar
              count={draft.classrooms.length}
              total={options?.classrooms.length ?? 0}
              noun="room"
              onAll={() =>
                set({ classrooms: (options?.classrooms ?? []).map((c) => c.id) })
              }
              onNone={() => set({ classrooms: [] })}
            />
            {(options?.classrooms ?? []).map((room) => (
              <CheckRow
                key={room.id}
                checked={draft.classrooms.includes(room.id)}
                onToggle={() =>
                  set({ classrooms: toggle(draft.classrooms, room.id) })
                }
                label={room.name}
                detail={`${room.gradeLabel}${
                  room.roomNumber ? ` · Room ${room.roomNumber}` : ""
                } · ${room.families} ${
                  room.families === 1 ? "family" : "families"
                }, ${room.staff} staff`}
              />
            ))}
            {(options?.classrooms ?? []).length === 0 && (
              <p className="text-sm text-muted">
                No classrooms have been set up yet.
              </p>
            )}
          </div>
        ) : draft.kind === NOTIFICATION_AUDIENCE.STUDENT ? (
          <div className="space-y-3">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
              />
              <input
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="Search a child, a guardian or a room"
                aria-label="Search children"
                className="w-full rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
              />
            </div>

            <GroupToolbar
              count={draft.students.length}
              total={(options?.studentGroups ?? []).reduce(
                (sum, group) => sum + group.students.length,
                0,
              )}
              noun="child"
              plural="children"
              onAll={null}
              onNone={() => set({ students: [] })}
            />

            <div className="max-h-72 space-y-4 overflow-y-auto rounded-control border border-border p-3">
              {studentGroups.length === 0 ? (
                <p className="text-sm text-muted">
                  {studentSearch
                    ? "No children match that."
                    : "No children are on the roll yet."}
                </p>
              ) : (
                studentGroups.map((group) => {
                  const ids = group.students.map((s) => s.id);
                  const allOn = ids.every((id) => draft.students.includes(id));
                  return (
                    <div key={group.classroom?.id ?? "unseated"}>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                          {group.classroom?.name ?? "Not in a room yet"}
                        </h4>
                        <button
                          type="button"
                          onClick={() =>
                            set({
                              students: allOn
                                ? draft.students.filter(
                                    (id) => !ids.includes(id),
                                  )
                                : Array.from(
                                    new Set([...draft.students, ...ids]),
                                  ),
                            })
                          }
                          className="text-xs font-semibold text-primary transition-colors hover:text-primary-active"
                        >
                          {allOn ? "Clear room" : "Select room"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.students.map((student) => {
                          const on = draft.students.includes(student.id);
                          return (
                            <button
                              key={student.id}
                              type="button"
                              onClick={() =>
                                set({
                                  students: toggle(draft.students, student.id),
                                })
                              }
                              aria-pressed={on}
                              title={
                                student.guardians.length > 0
                                  ? student.guardians.join(", ")
                                  : "No guardian is linked to this child yet."
                              }
                              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                                on
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border-strong bg-surface text-foreground hover:bg-surface-hover"
                              }`}
                            >
                              {student.fullName}
                              {/* A child nobody is linked to cannot be
                                  reached, and that has to be visible at the
                                  moment of picking rather than afterwards. */}
                              {student.recipients === 0 && (
                                <span className="ml-1.5 text-xs opacity-70">
                                  no guardian
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-muted">{reach}</p>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

/**
 * "This reaches 14 families and 3 staff."
 *
 * Summed over the selection rather than fetched per keystroke, so it moves as
 * the ticks move. Families are deduped across rooms - siblings in two rooms
 * are one household - which is the same rule the API counts by.
 */
function describeReach(
  draft: Draft,
  options: AudienceOptions | undefined,
): string {
  if (!options) return "";

  const people = (families: number, staff: number) => {
    const parts: string[] = [];
    if (families > 0) {
      parts.push(`${families} ${families === 1 ? "family" : "families"}`);
    }
    if (staff > 0) parts.push(`${staff} staff`);
    if (parts.length === 0) return "This reaches nobody yet.";
    return `This reaches ${parts.join(" and ")}.`;
  };

  switch (draft.kind) {
    case NOTIFICATION_AUDIENCE.ALL:
      return people(options.everyone.families, options.everyone.staff);
    case NOTIFICATION_AUDIENCE.ROLE: {
      const picked = options.roles.filter((role) =>
        draft.roles.includes(role.value),
      );
      const families =
        picked.find((r) => r.value === "PARENT")?.recipients ?? 0;
      const staff = picked.find((r) => r.value === "TEACHER")?.recipients ?? 0;
      return people(families, staff);
    }
    case NOTIFICATION_AUDIENCE.CLASSROOM: {
      /*
       * Rooms are summed, not deduped, and that is a known overcount for a
       * family with children in two of the selected rooms. The exact figure
       * needs the per-room guardian lists, which is a heavier payload than
       * this line is worth - so it is worded as a room count once more than
       * one room is picked, rather than stated as a precise number that is
       * quietly wrong.
       */
      const rooms = options.classrooms.filter((room) =>
        draft.classrooms.includes(room.id),
      );
      if (rooms.length === 0) return "Pick at least one classroom.";
      if (rooms.length === 1) return people(rooms[0].families, rooms[0].staff);
      const families = rooms.reduce((sum, room) => sum + room.families, 0);
      const staff = rooms.reduce((sum, room) => sum + room.staff, 0);
      return `This reaches ${rooms.length} rooms - up to ${families} families and ${staff} staff.`;
    }
    case NOTIFICATION_AUDIENCE.STUDENT: {
      if (draft.students.length === 0) return "Pick at least one child.";
      const picked = new Set(draft.students);
      const unreachable = (options.studentGroups ?? [])
        .flatMap((group) => group.students)
        .filter(
          (student) => picked.has(student.id) && student.recipients === 0,
        ).length;

      const children = `${draft.students.length} ${
        draft.students.length === 1 ? "child" : "children"
      }`;
      return unreachable === 0
        ? `This goes to the guardians of ${children}.`
        : `This goes to the guardians of ${children} - ${unreachable} of them has nobody linked yet.`;
    }
  }
}

function CheckRow({
  checked,
  onToggle,
  label,
  detail,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5 transition-colors ${
        checked
          ? "border-primary bg-primary-subtle"
          : "border-border-strong bg-surface hover:bg-surface-hover"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 accent-[var(--color-primary,#2f7d4f)]"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </label>
  );
}

function GroupToolbar({
  count,
  total,
  noun,
  plural,
  onAll,
  onNone,
}: {
  count: number;
  total: number;
  noun: string;
  plural?: string;
  onAll: (() => void) | null;
  onNone: () => void;
}) {
  const word = count === 1 ? noun : (plural ?? `${noun}s`);
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted">
        {count} of {total} {word} selected
      </span>
      <span className="flex gap-3">
        {onAll && (
          <button
            type="button"
            onClick={onAll}
            className="font-semibold text-primary transition-colors hover:text-primary-active"
          >
            Select all
          </button>
        )}
        <button
          type="button"
          onClick={onNone}
          disabled={count === 0}
          className="font-semibold text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          Clear
        </button>
      </span>
    </div>
  );
}
