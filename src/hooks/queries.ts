"use client";

import { useCallback } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { fetchJson } from "@/lib/fetchJson";
import type { AttendanceRow, AttendanceSummary } from "@/lib/attendance";
import type { AttendanceStatus } from "@/models/enums";
import type { ClassroomRow } from "@/lib/classrooms";
import type { ClinicalVisitRow, VisitSummary } from "@/lib/clinicalVisits";
import type { DailyProgressRow, ProgressSummary } from "@/lib/dailyProgress";
import type { FeedbackRow, FeedbackSummary } from "@/lib/feedback";
import type { GalleryItemRow } from "@/lib/gallery";
import type { AudienceOptions, NotificationRow } from "@/lib/notifications";
import type {
  MessageRecipientRow,
  MessageRow,
  MessageThreadRow,
} from "@/lib/messages";
import type { GuardianLinkRequestRow } from "@/lib/guardianLinks";
import type { ParentRow } from "@/lib/parents";
import type { StudentRow } from "@/lib/students";
import type { TeacherRow } from "@/lib/teachers";
import type { WeeklyChildRow, WeeklySummary } from "@/lib/weeklyProgress";

/**
 * Every read the dashboard makes, in one place.
 *
 * The screens used to each own a `load()` of their own - same fetch, same
 * `.catch(() => ({}))`, same four pieces of state - which meant the URL a
 * screen depends on was a detail buried three hundred lines into a component
 * that is mostly table markup. Collecting them here is what makes the cache
 * work at all: two screens only share an answer if they agree on the key, and
 * they can only be relied on to agree if the key is written once.
 *
 * Nothing here mutates. Writes stay where they are - next to the form that
 * knows what its own 409 means - and tell the cache what they changed through
 * `useInvalidate`.
 */

/* -------------------------------------------------------------------------- */
/* Keys                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Keys are prefix-nested on purpose: `["students"]` covers the list, the
 * options endpoint and every page of both, so a write says "students changed"
 * rather than having to enumerate which reads of students it broke.
 */
export const queryKeys = {
  students: {
    all: ["students"] as const,
    list: (search: string, page: number) =>
      ["students", "list", search, page] as const,
    options: ["students", "options"] as const,
  },
  teachers: {
    all: ["teachers"] as const,
    list: (search: string, page: number) =>
      ["teachers", "list", search, page] as const,
    options: ["teachers", "options"] as const,
  },
  parents: {
    all: ["parents"] as const,
    list: (search: string, page: number) =>
      ["parents", "list", search, page] as const,
    options: (query: string) => ["parents", "options", query] as const,
  },
  guardianLinkRequests: {
    all: ["guardian-link-requests"] as const,
    list: (status: string, page: number) =>
      ["guardian-link-requests", "list", status, page] as const,
  },
  classrooms: {
    all: ["classrooms"] as const,
    list: (search: string, page: number) =>
      ["classrooms", "list", search, page] as const,
    picker: ["classrooms", "picker"] as const,
    roster: (classroomId: string, search = "", page?: number) =>
      ["classrooms", "roster", classroomId, search, page] as const,
  },
  attendance: {
    all: ["attendance"] as const,
    list: (date: string, classroom: string, status: string) =>
      ["attendance", "list", date, classroom, status] as const,
    register: (date: string, classroom: string) =>
      ["attendance", "register", date, classroom] as const,
  },
  dailyProgress: {
    all: ["daily-progress"] as const,
    list: (date: string, classroom: string, asRoster: boolean) =>
      ["daily-progress", "list", date, classroom, asRoster] as const,
  },
  weeklyProgress: {
    all: ["weekly-progress"] as const,
    list: (week: string, classroom: string) =>
      ["weekly-progress", "list", week, classroom] as const,
  },
  gallery: {
    all: ["gallery"] as const,
    list: (classroom: string, type: string) =>
      ["gallery", "list", classroom, type] as const,
  },
  clinicalVisits: {
    all: ["clinical-visits"] as const,
    list: (classroom: string, outcome: string, from: string, to: string) =>
      ["clinical-visits", "list", classroom, outcome, from, to] as const,
    forStudent: (studentId: string) =>
      ["clinical-visits", "student", studentId] as const,
  },
  feedback: {
    all: ["feedback"] as const,
    list: (query: FeedbackQuery) =>
      [
        "feedback",
        "list",
        query.search,
        query.experience,
        query.sort,
        query.order,
        query.page,
        query.perPage,
      ] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (query: NotificationQuery) =>
      [
        "notifications",
        "list",
        query.kind,
        query.search,
        query.includeInactive,
        query.page,
        query.perPage,
      ] as const,
    audience: ["notifications", "audience"] as const,
  },
  messages: {
    all: ["messages"] as const,
    threads: ["messages", "threads"] as const,
    thread: (threadId: string) => ["messages", "thread", threadId] as const,
    options: ["messages", "options"] as const,
    unreadCount: ["messages", "unread-count"] as const,
  },
} as const;

/**
 * "These reads are out of date."
 *
 * Takes whole key prefixes, so a caller names the things it changed rather
 * than the queries that happened to be watching them. Invalidation refetches
 * what is on screen and only marks the rest stale, so a screen nobody is
 * looking at costs nothing until it is opened.
 */
export function useInvalidate() {
  const client = useQueryClient();

  return useCallback(
    (...keys: readonly (readonly unknown[])[]) => {
      for (const key of keys) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
    [client],
  );
}

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                              */
/* -------------------------------------------------------------------------- */

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  pageCount: number;
}

/** What a list screen shows before its first answer arrives. */
export const EMPTY_PAGINATION: Pagination = {
  page: 1,
  perPage: 20,
  total: 0,
  pageCount: 1,
};

/** One child on a roster, as `/api/classrooms/:id/students` sends it. */
export interface RosterStudent {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  isActive: boolean;
  enrolledAt: string | null;
  guardians?: { parentId: string; name: string; relationship?: string }[];
}

/** A child who can be moved into a room, as `/api/students/options` sends it. */
export interface AssignableStudent {
  id: string;
  fullName: string;
  age: number;
  parentName?: string | null;
  currentClassroomId: string | null;
}

export interface TeacherOption {
  id: string;
  name: string;
}

export interface ParentOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** What tells two guardians with the same name apart. */
  children: { id: string; name: string }[];
}

/** `?page=2&search=ada`, minus the empty search a list would otherwise send. */
function listParams(search: string, page: number): string {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("search", search);
  return params.toString();
}

/**
 * Filters, minus the blanks. An unset dropdown means "no opinion", not
 * `classroom=`, and the difference matters because the empty string would
 * otherwise reach the API as a filter value.
 */
function filterParams(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

/**
 * Paging and filtering feel like paging and filtering rather than like
 * reloading: the rows already on screen stay put while the next set is
 * fetched, instead of the table emptying itself first. A first load still has
 * nothing to keep, so it still shows its loading row.
 */
const KEEP_ROWS = { placeholderData: keepPreviousData } as const;

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

export function useStudentsQuery(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.students.list(search, page),
    queryFn: () =>
      fetchJson<{ students: StudentRow[]; pagination: Pagination }>(
        `/api/students?${listParams(search, page)}`,
      ),
    ...KEEP_ROWS,
  });
}

export function useTeachersQuery(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.teachers.list(search, page),
    queryFn: () =>
      fetchJson<{ teachers: TeacherRow[]; pagination: Pagination }>(
        `/api/teachers?${listParams(search, page)}`,
      ),
    ...KEEP_ROWS,
  });
}

export function useParentsQuery(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.parents.list(search, page),
    queryFn: () =>
      fetchJson<{ parents: ParentRow[]; pagination: Pagination }>(
        `/api/parents?${listParams(search, page)}`,
      ),
    ...KEEP_ROWS,
  });
}

/**
 * The queue of guardians asking to be linked to a child.
 *
 * `staleTime: 0` because this is a shared worklist: two members of staff may be
 * working it at once, and a row that has already been decided somewhere else
 * should disappear on the next look rather than sit there inviting a second
 * click. The API refuses the second click anyway - this just spares the error.
 */
export function useGuardianLinkRequestsQuery(status: string, page: number) {
  return useQuery({
    queryKey: queryKeys.guardianLinkRequests.list(status, page),
    queryFn: () =>
      fetchJson<{
        requests: GuardianLinkRequestRow[];
        pagination: Pagination;
      }>(`/api/guardian-link-requests?${filterParams({ status, page: String(page) })}`),
    staleTime: 0,
    ...KEEP_ROWS,
  });
}

/**
 * Guardian search for the enrolment form. An empty box still asks: the API
 * answers it with the most recently added guardians, which is very often the
 * one wanted when enrolling a sibling.
 */
export function useParentOptionsQuery(query: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.parents.options(query),
    queryFn: () =>
      fetchJson<{ parents: ParentOption[] }>(
        `/api/parents/options?q=${encodeURIComponent(query)}`,
      ),
    enabled,
    ...KEEP_ROWS,
  });
}

/** The teacher picker on the homeroom form. */
export function useTeacherOptionsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.teachers.options,
    queryFn: () =>
      fetchJson<{ teachers: TeacherOption[] }>("/api/teachers/options"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Classrooms                                                                 */
/* -------------------------------------------------------------------------- */

export function useClassroomsQuery(search: string, page: number) {
  return useQuery({
    queryKey: queryKeys.classrooms.list(search, page),
    queryFn: () =>
      fetchJson<{ classrooms: ClassroomRow[]; pagination: Pagination }>(
        `/api/classrooms?${listParams(search, page)}`,
      ),
    ...KEEP_ROWS,
  });
}

/**
 * The classroom dropdown that sits on top of five different screens.
 *
 * This is the clearest win in the whole cache. It is the same request every
 * time - and the same one each of those screens used to fire on its own mount -
 * so moving between Attendance, Daily Progress, Weekly Progress, Gallery and
 * Health Reports now costs one fetch for all five instead of one each.
 *
 * The list is scoped server-side: every room for an admin, the caller's own
 * rooms for a teacher, none for a guardian. Nothing is filtered here.
 */
export function useClassroomPickerQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.classrooms.picker,
    queryFn: () =>
      fetchJson<{ classrooms: ClassroomRow[] }>("/api/classrooms?perPage=100"),
    enabled,
    // Rooms are set up once a term. Re-asking on every screen change is waste.
    staleTime: 5 * 60_000,
  });
}

export interface ClassroomRosterQueryOptions {
  search?: string;
  page?: number;
  perPage?: number;
}

/** Who is enrolled in one room. Drives the roster panel and two child pickers. */
export function useClassroomRosterQuery(
  classroomId: string,
  optionsOrEnabled?: ClassroomRosterQueryOptions | boolean,
  enabledArg = true,
) {
  const options: ClassroomRosterQueryOptions =
    typeof optionsOrEnabled === "object" && optionsOrEnabled !== null
      ? optionsOrEnabled
      : {};
  const enabled =
    typeof optionsOrEnabled === "boolean" ? optionsOrEnabled : enabledArg;

  const search = options.search ?? "";
  const page = options.page;
  const perPage = options.perPage;

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (page) params.set("page", String(page));
  if (perPage) params.set("perPage", String(perPage));
  const queryString = params.toString();

  return useQuery({
    queryKey: queryKeys.classrooms.roster(classroomId, search, page),
    queryFn: () =>
      fetchJson<{
        students: RosterStudent[];
        classroom: ClassroomRow;
        pagination?: Pagination;
      }>(
        `/api/classrooms/${classroomId}/students${
          queryString ? `?${queryString}` : ""
        }`,
      ),
    enabled: enabled && classroomId !== "",
  });
}

/** Children who can be enrolled, for the roster panel's add picker. */
export function useAssignableStudentsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.students.options,
    queryFn: () =>
      fetchJson<{ students: AssignableStudent[] }>("/api/students/options"),
    enabled,
  });
}

/* -------------------------------------------------------------------------- */
/* The daily record                                                           */
/* -------------------------------------------------------------------------- */

interface ScopeInfo {
  role: string;
  /** null means unrestricted - the super admin. */
  classroomIds: string[] | null;
}

export function useAttendanceQuery(
  date: string,
  classroom: string,
  status: string,
) {
  return useQuery({
    queryKey: queryKeys.attendance.list(date, classroom, status),
    queryFn: () =>
      fetchJson<{
        records: AttendanceRow[];
        summary: AttendanceSummary | null;
        scope: ScopeInfo | null;
      }>(`/api/attendance?${filterParams({ date, classroom, status })}`),
    ...KEEP_ROWS,
  });
}

/** One roster row on the register sheet: the child, and their mark if taken. */
export interface AttendanceRegisterEntry {
  student: {
    id: string;
    fullName: string;
    age: number;
    photoUrl: string | null;
  };
  /** null means nobody has marked this child for the day yet. */
  status: AttendanceStatus | null;
  statusLabel: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string | null;
  /** False when the existing line was taken in a room the child has since left. */
  markedInThisClassroom: boolean;
}

export interface AttendanceRegisterSheet {
  classroom: { id: string; name: string; gradeLevel: string };
  date: string;
  entries: AttendanceRegisterEntry[];
  summary: AttendanceSummary;
  unmarked: number;
}

/**
 * The register sheet for one room and one day - the roster left-joined with
 * whatever has been marked so far, so an untouched child still appears with
 * `status: null`. Staff only; the screen POSTs the whole sheet back to
 * `/api/attendance`. Works for any past day, which is what lets an admin
 * correct an earlier register.
 */
export function useAttendanceRegisterQuery(
  date: string,
  classroom: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.attendance.register(date, classroom),
    queryFn: () =>
      fetchJson<AttendanceRegisterSheet>(
        `/api/attendance/register?${filterParams({ date, classroom })}`,
      ),
    enabled: enabled && classroom !== "",
  });
}

/** One roster row: the child, and the sheet for them that day if there is one. */
export interface DailyProgressEntry {
  student: { id: string; fullName: string; age?: number };
  sheet: DailyProgressRow | null;
  recordedInThisClassroom?: boolean;
}

/**
 * The daily sheets for a room and a day.
 *
 * `asRoster` picks the endpoint, not the filtering. Staff read the roster
 * route, which lists every enrolled child including the ones nobody has
 * written a sheet for; a guardian cannot call that - a whole-room roster is
 * not theirs to see - so they read the plain list route, already narrowed to
 * their own children. Both scope themselves server-side, so the flag is a
 * rendering decision that a devtools edit cannot turn into another family's
 * data.
 *
 * The two response shapes are reconciled here rather than in the table, so the
 * screen renders one way for both roles.
 */
export function useDailyProgressQuery(
  date: string,
  classroom: string,
  asRoster: boolean,
) {
  return useQuery({
    queryKey: queryKeys.dailyProgress.list(date, classroom, asRoster),
    queryFn: async () => {
      const query = filterParams({ date, classroom });
      const payload = await fetchJson<{
        entries?: DailyProgressEntry[];
        records?: DailyProgressRow[];
        summary?: ProgressSummary | null;
      }>(
        asRoster
          ? `/api/daily-progress/sheets?${query}`
          : `/api/daily-progress?${query}`,
      );

      const entries: DailyProgressEntry[] = asRoster
        ? (payload.entries ?? [])
        : (payload.records ?? []).map((row) => ({
            student: row.student,
            sheet: row,
          }));

      return { entries, summary: payload.summary ?? null };
    },
    ...KEEP_ROWS,
  });
}

export interface WeekMeta {
  start: string;
  end: string;
  label: string;
  days: string[];
}

export function useWeeklyProgressQuery(week: string, classroom: string) {
  return useQuery({
    queryKey: queryKeys.weeklyProgress.list(week, classroom),
    queryFn: () =>
      fetchJson<{
        children: WeeklyChildRow[];
        week: WeekMeta | null;
        summary: WeeklySummary | null;
      }>(`/api/weekly-progress?${filterParams({ week, classroom })}`),
    ...KEEP_ROWS,
  });
}

/* -------------------------------------------------------------------------- */
/* Gallery and health                                                         */
/* -------------------------------------------------------------------------- */

export function useGalleryQuery(classroom: string, type: string) {
  return useQuery({
    queryKey: queryKeys.gallery.list(classroom, type),
    queryFn: () =>
      fetchJson<{ items: GalleryItemRow[] }>(
        `/api/gallery?${filterParams({ classroom, type })}`,
      ),
    ...KEEP_ROWS,
  });
}

export function useClinicalVisitsQuery(
  classroom: string,
  outcome: string,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: queryKeys.clinicalVisits.list(classroom, outcome, from, to),
    queryFn: () =>
      fetchJson<{ visits: ClinicalVisitRow[]; summary: VisitSummary | null }>(
        `/api/clinical-visits?${filterParams({ classroom, outcome, from, to })}`,
      ),
    ...KEEP_ROWS,
  });
}

/** One child's whole visit history, for the health-record panel. */
export function useStudentVisitsQuery(studentId: string) {
  return useQuery({
    queryKey: queryKeys.clinicalVisits.forStudent(studentId),
    queryFn: () =>
      fetchJson<{ visits: ClinicalVisitRow[] }>(
        `/api/clinical-visits?student=${studentId}`,
      ),
  });
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything the feedback table can vary, in one object.
 *
 * A bag rather than seven positional arguments: the table has a search box,
 * two dropdowns, a sortable header and a pager, and a key built from seven
 * loose parameters is one reordered call away from two screens disagreeing
 * about what they are caching.
 */
export interface FeedbackQuery {
  search: string;
  experience: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
  perPage: number;
}

/**
 * The feedback list. Scoped server-side: every row for the super admin, a
 * guardian's own submissions for a guardian.
 */
export function useFeedbackQuery(query: FeedbackQuery) {
  return useQuery({
    queryKey: queryKeys.feedback.list(query),
    queryFn: () =>
      fetchJson<{
        feedback: FeedbackRow[];
        summary: FeedbackSummary;
        pagination: Pagination;
      }>(
        `/api/feedback?${filterParams({
          search: query.search,
          experience: query.experience,
          sort: query.sort,
          order: query.order,
          page: String(query.page),
          perPage: String(query.perPage),
        })}`,
      ),
    ...KEEP_ROWS,
  });
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/** Everything the notification table can vary, in one object - see FeedbackQuery. */
export interface NotificationQuery {
  /** One audience kind, or "" for all of them. */
  kind: string;
  search: string;
  /** Author-only. The API ignores it for every other role. */
  includeInactive: boolean;
  page: number;
  perPage: number;
}

/**
 * The notice board. Scoped server-side: every notice for the super admin who
 * wrote them, and for everybody else only the ones whose audience reaches them.
 */
export function useNotificationsQuery(query: NotificationQuery) {
  return useQuery({
    queryKey: queryKeys.notifications.list(query),
    queryFn: () =>
      fetchJson<{
        notifications: NotificationRow[];
        pagination: Pagination;
      }>(
        `/api/notifications?${filterParams({
          kind: query.kind,
          search: query.search,
          includeInactive: query.includeInactive ? "true" : "",
          page: String(query.page),
          perPage: String(query.perPage),
        })}`,
      ),
    ...KEEP_ROWS,
  });
}

/**
 * The audience picker, already grouped by kind.
 *
 * Held for a while because it is the roll of the school: rooms, children and
 * who their guardians are change on the timescale of an enrolment, not of a
 * modal being opened and closed while somebody drafts a notice.
 */
export function useAudienceOptionsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.audience,
    queryFn: () => fetchJson<AudienceOptions>("/api/notifications/audience"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The polling fallback.
 *
 * Messages is driven by the WebSocket in `RealtimeProvider` now, and while it
 * is connected none of these intervals run - `live` turns them off. They are
 * kept, at their original rates, for every case where the socket cannot be had:
 * a serverless host with no process to hold one open, a proxy that strips the
 * upgrade, a network that blocks it. On those the screen falls back to exactly
 * the behaviour it had before, rather than to nothing.
 */
export const THREAD_POLL_MS = 8_000;
export const LIST_POLL_MS = 30_000;
export const UNREAD_POLL_MS = 60_000;

export interface ThreadPayload {
  thread: MessageThreadRow | null;
  messages: MessageRow[];
}

export function useMessageThreadsQuery(live: boolean) {
  return useQuery({
    queryKey: queryKeys.messages.threads,
    queryFn: () =>
      fetchJson<{ threads: MessageThreadRow[] }>("/api/messages/threads"),
    // Silent while the socket is up; it pushes instead.
    refetchInterval: live ? false : LIST_POLL_MS,
    // An inbox nobody is looking at is not worth a request, or a phone radio.
    refetchIntervalInBackground: false,
    // A conversation list is live data; the shared 30s default would let a
    // remount serve an inbox from cache without checking it.
    staleTime: 0,
  });
}

/** Who this person may start a conversation with, and about which child. */
export function useMessageOptionsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.messages.options,
    queryFn: () =>
      fetchJson<{ students: MessageRecipientRow[] }>("/api/messages/options"),
    enabled,
  });
}

/**
 * The sidebar badge. Pushed to while the socket is up; otherwise polled slowly,
 * because a badge is a nudge rather than a notification.
 */
export function useUnreadCountQuery(enabled = true, live = false) {
  return useQuery({
    queryKey: queryKeys.messages.unreadCount,
    queryFn: () => fetchJson<{ count: number }>("/api/messages/unread-count"),
    enabled,
    refetchInterval: live ? false : UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}
