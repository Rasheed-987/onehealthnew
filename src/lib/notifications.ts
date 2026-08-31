import { z } from "zod";

import { Classroom, Student, User } from "@/models";
import type { IClassroom, INotification, IStudent, IUser } from "@/models";
import {
  NOTIFICATION_AUDIENCE,
  NOTIFICATION_MAX_LENGTH,
  NOTIFICATION_ROLE_TARGET,
  NOTIFICATION_ROLE_TARGET_LABEL,
  NOTIFICATION_TITLE_MAX_LENGTH,
  type NotificationAudienceKind,
  type NotificationRoleTarget,
} from "@/models/enums";

/**
 * Shapes shared by the notification routes and the screens that call them.
 *
 * The one idea worth holding on to: the audience is a RULE with a `kind`, not
 * a flat list of names. Everything here - the schema that accepts one, the row
 * that renders one, the options payload the picker is built from - is grouped
 * by that kind, so the four categories stay four categories from the database
 * all the way to the checkbox the admin ticks.
 */

/* -------------------------------------------------------------------------- */
/* Writing one                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The audience, as the composer submits it.
 *
 * A discriminated union rather than one object with three optional arrays,
 * because that is what makes "All parents, and also these two rooms"
 * unrepresentable rather than merely discouraged. Zod rejects the extra list
 * before it ever reaches the model's own one-kind-one-list check.
 */
export const AudienceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(NOTIFICATION_AUDIENCE.ALL) }),
  z.object({
    kind: z.literal(NOTIFICATION_AUDIENCE.ROLE),
    roles: z
      .array(z.enum(NOTIFICATION_ROLE_TARGET))
      .min(1, "Pick at least one role."),
  }),
  z.object({
    kind: z.literal(NOTIFICATION_AUDIENCE.CLASSROOM),
    classrooms: z
      .array(z.string().min(1))
      .min(1, "Pick at least one classroom."),
  }),
  z.object({
    kind: z.literal(NOTIFICATION_AUDIENCE.STUDENT),
    students: z.array(z.string().min(1)).min(1, "Pick at least one child."),
  }),
]);
export type AudienceInput = z.infer<typeof AudienceInputSchema>;

const bodyField = z
  .string()
  .trim()
  .min(1, "Write the notification.")
  .max(
    NOTIFICATION_MAX_LENGTH,
    `Keep the notification under ${NOTIFICATION_MAX_LENGTH} characters.`,
  );

const titleField = z
  .string()
  .trim()
  .max(
    NOTIFICATION_TITLE_MAX_LENGTH,
    `Keep the headline under ${NOTIFICATION_TITLE_MAX_LENGTH} characters.`,
  )
  .transform((value) => (value === "" ? undefined : value))
  .optional();

export const CreateNotificationSchema = z.object({
  title: titleField,
  body: bodyField,
  audience: AudienceInputSchema,
});
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

/**
 * Editing one.
 *
 * The audience is editable, unlike the media on a gallery post - and for the
 * opposite reason to the one that froze that. A photo swapped under a post
 * families have already seen is a different photo; an audience corrected two
 * minutes after sending is the school fixing "I meant Nursery 3", which is
 * exactly the mistake a notice board has to be able to fix.
 */
export const UpdateNotificationSchema = z.object({
  title: z.string().trim().max(NOTIFICATION_TITLE_MAX_LENGTH).optional(),
  body: bodyField.optional(),
  audience: AudienceInputSchema.optional(),
  /** False withdraws it; true puts a withdrawn notice back. */
  isActive: z.boolean().optional(),
});
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;

/* -------------------------------------------------------------------------- */
/* Reading one                                                                */
/* -------------------------------------------------------------------------- */

/** One named target on a row: a role, a room, or a child. */
export interface AudienceTarget {
  /** The role string for ROLE, otherwise the classroom or student id. */
  id: string;
  label: string;
}

export interface NotificationRow {
  id: string;
  title: string | null;
  body: string;
  audience: {
    kind: NotificationAudienceKind;
    /** The "For" column: "All parents", "Nursery 2 and 2 more rooms". */
    label: string;
    /** The same audience spelled out. Empty for ALL, which names nobody. */
    targets: AudienceTarget[];
  };
  isActive: boolean;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * "Nursery 2 and 2 more rooms".
 *
 * The first name plus a count rather than all of them, because this is a table
 * cell: a notice sent to eleven rooms would otherwise wrap the row to four
 * lines and push the notification itself off screen. The full list rides on
 * the row as `targets`, and the composer shows every one of them.
 */
function summarise(targets: AudienceTarget[], noun: string): string {
  if (targets.length === 0) return "Nobody";
  if (targets.length === 1) return targets[0].label;
  const rest = targets.length - 1;
  return `${targets[0].label} and ${rest} more ${noun}${rest === 1 ? "" : "s"}`;
}

export function describeAudience(
  targets: AudienceTarget[],
  kind: NotificationAudienceKind,
): string {
  switch (kind) {
    case NOTIFICATION_AUDIENCE.ALL:
      return "Everyone";
    case NOTIFICATION_AUDIENCE.ROLE:
      // Both roles is the whole school, so say that rather than list them.
      return targets.length === NOTIFICATION_ROLE_TARGET.length
        ? "All parents and all teachers"
        : summarise(targets, "role");
    case NOTIFICATION_AUDIENCE.CLASSROOM:
      return summarise(targets, "room");
    case NOTIFICATION_AUDIENCE.STUDENT:
      if (targets.length <= 1) return summarise(targets, "child");
      // "children", not "childs" - the only plural the helper cannot form.
      return `${targets[0].label} and ${targets.length - 1} more ${
        targets.length === 2 ? "child" : "children"
      }`;
  }
}

export function toNotificationRow(
  notification: INotification,
  classrooms: Map<string, IClassroom>,
  students: Map<string, IStudent>,
  authors: Map<string, IUser>,
): NotificationRow {
  const { audience } = notification;

  let targets: AudienceTarget[] = [];
  if (audience.kind === NOTIFICATION_AUDIENCE.ROLE) {
    targets = audience.roles.map((role) => ({
      id: role,
      label: NOTIFICATION_ROLE_TARGET_LABEL[role],
    }));
  } else if (audience.kind === NOTIFICATION_AUDIENCE.CLASSROOM) {
    targets = audience.classrooms.map((id) => ({
      id: String(id),
      // A room closed after the notice went out still has to render.
      label: classrooms.get(String(id))?.name ?? "Removed classroom",
    }));
  } else if (audience.kind === NOTIFICATION_AUDIENCE.STUDENT) {
    targets = audience.students.map((id) => {
      const student = students.get(String(id));
      return {
        id: String(id),
        label: student
          ? `${student.firstName} ${student.lastName}`.trim()
          : "Removed child",
      };
    });
  }

  const author = authors.get(String(notification.createdBy));

  return {
    id: String(notification._id),
    title: notification.title ?? null,
    body: notification.body,
    audience: {
      kind: audience.kind,
      label: describeAudience(targets, audience.kind),
      targets,
    },
    isActive: notification.isActive,
    createdBy: author
      ? {
          id: String(author._id),
          name: `${author.firstName} ${author.lastName}`.trim(),
        }
      : null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

/**
 * Fills in the names a page of notices refers to by id.
 *
 * Three `$in` lookups rather than `populate`, for the same reason as the
 * gallery hydrator: a term's worth of announcements names the same handful of
 * rooms and the same one author over and over.
 */
export async function hydrateNotificationRows(
  notifications: INotification[],
): Promise<NotificationRow[]> {
  if (notifications.length === 0) return [];

  const ids = <T,>(values: T[]) =>
    Array.from(new Set(values.filter(Boolean).map(String)));

  const [classrooms, students, authors] = await Promise.all([
    Classroom.find({
      _id: { $in: ids(notifications.flatMap((n) => n.audience.classrooms)) },
    }),
    Student.find({
      _id: { $in: ids(notifications.flatMap((n) => n.audience.students)) },
    }),
    User.find({ _id: { $in: ids(notifications.map((n) => n.createdBy)) } }),
  ]);

  const byId = <T extends { _id: unknown }>(docs: T[]) =>
    new Map(docs.map((d) => [String(d._id), d]));

  return notifications.map((notification) =>
    toNotificationRow(
      notification,
      byId(classrooms) as Map<string, IClassroom>,
      byId(students) as Map<string, IStudent>,
      byId(authors) as Map<string, IUser>,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* The picker                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything the audience picker draws, already grouped by kind.
 *
 * This is the answer to "how do we categorise these so they can be assigned
 * easily". The grouping is done on the server rather than in the component,
 * because it is not a layout choice - it is the same four kinds the model
 * stores, and a picker that regrouped them client-side could drift out of step
 * with what the API will accept.
 *
 * Every option carries its reach. Somebody about to announce a closure to a
 * room should see "14 families, 3 staff" before they send it, not learn it
 * afterwards from the replies.
 */
export interface RoleOption {
  value: NotificationRoleTarget;
  label: string;
  /** Accounts that would receive it. Suspended accounts are not counted. */
  recipients: number;
}

export interface ClassroomOption {
  id: string;
  name: string;
  gradeLabel: string;
  roomNumber: string | null;
  /** Children currently seated in the room. */
  students: number;
  /** Distinct guardian accounts behind those children. */
  families: number;
  /** Teachers posted to the room, lead and assistants. */
  staff: number;
}

export interface StudentOption {
  id: string;
  fullName: string;
  /** What tells two children with the same first name apart. */
  guardians: string[];
  /** Guardian accounts that would receive it. Zero is worth showing. */
  recipients: number;
}

/**
 * Children grouped by the room they sit in, so a roll of two hundred stays
 * navigable. `classroom: null` is the group for children with no active
 * enrolment - newly admitted, or between rooms. They are targetable, because
 * their guardians are exactly the people a school needs to reach while the
 * paperwork is still being sorted out.
 */
export interface StudentGroup {
  classroom: { id: string; name: string } | null;
  students: StudentOption[];
}

export interface AudienceOptions {
  everyone: { families: number; staff: number };
  roles: RoleOption[];
  classrooms: ClassroomOption[];
  studentGroups: StudentGroup[];
}
