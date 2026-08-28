import { Types } from "mongoose";
import { z } from "zod";

import type { SessionPayload } from "@/lib/session";

import {
  Classroom,
  Message,
  MessageThread,
  Parent,
  Student,
  Teacher,
  User,
} from "@/models";
import type {
  IMessage,
  IMessageThread,
  IStudent,
  ITeacher,
  IUser,
} from "@/models";
import {
  GUARDIAN_RELATIONSHIP_LABEL,
  MESSAGE_MAX_LENGTH,
  PREVIEW_LENGTH,
  USER_ROLE,
  type GuardianRelationship,
  type UserRole,
} from "@/models/enums";

/**
 * Shapes shared by the messaging routes and the screens that call them.
 *
 * The idea worth holding on to: a thread is keyed on a child and a teacher, and
 * everyone listed as that child's guardian is on the family side of it. So the
 * speaker on any given line is identified by their **User** account, not by a
 * Teacher or Parent profile - those are what the two sides have instead of a
 * common id, not what a transcript can be rendered from.
 *
 * `mine` is resolved here rather than in the browser, for the same reason the
 * rest of the dashboard passes `can*` booleans instead of the role: the client
 * should not be re-deriving an authorisation-shaped fact from a session it
 * cannot verify.
 *
 * This module imports Mongoose, so client components must `import type` from it.
 */

export const StartThreadSchema = z.object({
  student: z.string().min(1, "Choose a child."),
  teacher: z.string().min(1, "Choose a teacher."),
  /** Optional first message, so starting a conversation is one round trip. */
  body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH).optional(),
});
export type StartThreadInput = z.infer<typeof StartThreadSchema>;

export const SendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(
      MESSAGE_MAX_LENGTH,
      `A message cannot be longer than ${MESSAGE_MAX_LENGTH} characters.`,
    ),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export interface ThreadParticipantRow {
  id: string;
  /** "Ms. Amal", or "Fatima Ahmed (Mother)". */
  label: string;
}

/** Where one other participant has read up to. The raw material for "Seen". */
export interface ThreadReadReceipt {
  /** The reader's **User** id - `readState` is keyed on accounts, not profiles. */
  id: string;
  label: string;
  at: string;
}

export interface MessageThreadRow {
  id: string;
  student: { id: string; fullName: string };
  teacher: { id: string; label: string };
  classroom: { id: string; name: string } | null;
  /** Everyone on the family side. This is the answer to "who can read this". */
  guardians: ThreadParticipantRow[];
  lastMessage: { preview: string; at: string; mine: boolean } | null;
  unreadCount: number;
  /**
   * Everyone *except* the reader, and where each of them has got to. A message
   * of mine is "Seen" once one of these sits at or past it.
   *
   * Participants only. A super admin reading a thread has their position
   * recorded like anyone else - their unread badge depends on it - but they are
   * not on either side of the conversation, and surfacing them here would tell
   * a family that someone in the office had been reading their mail.
   */
  readReceipts: ThreadReadReceipt[];
  updatedAt: string;
}

/** A row in the "who can I message?" picker. See `api/messages/options`. */
export interface MessageRecipientRow {
  id: string;
  fullName: string;
  classroom: { id: string; name: string } | null;
  /** `threadId` is set when this pair is already talking. */
  teachers: { id: string; label: string; threadId: string | null }[];
}

export interface MessageRow {
  id: string;
  body: string;
  sender: { id: string; label: string; role: UserRole };
  /** Written by the person reading it. Drives which side of the thread it sits on. */
  mine: boolean;
  createdAt: string;
}

/** The inbox line. Newlines collapsed, because it renders as a single row. */
export function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…`
    : flat;
}

/**
 * Where this participant had got to. The epoch for someone who has never opened
 * the thread, which correctly makes every message in it unread.
 */
export function lastReadAtFor(
  thread: Pick<IMessageThread, "readState">,
  userId: string,
): Date {
  const entry = thread.readState.find((r) => String(r.user) === String(userId));
  return entry?.lastReadAt ?? new Date(0);
}

/**
 * Unread counts for a page of threads, in one aggregation.
 *
 * Two things keep this cheap. Threads whose last message predates the reader's
 * `lastReadAt` are dropped before the query - they are known to be zero, so
 * they contribute no `$or` clause. And each surviving clause is a range scan on
 * `{ thread, createdAt }` from that reader's own high-water mark.
 *
 * `sender: { $ne: me }` is not cosmetic: without it your own message would come
 * back as unread mail from yourself between sending it and the next poll.
 */
export async function unreadByThread(
  threads: IMessageThread[],
  userId: string,
): Promise<Map<string, number>> {
  const clauses = threads
    .filter((t) => lastReadAtFor(t, userId) < t.lastMessageAt)
    .map((t) => ({
      thread: t._id,
      createdAt: { $gt: lastReadAtFor(t, userId) },
    }));
  if (clauses.length === 0) return new Map();

  const rows = await Message.aggregate<{ _id: Types.ObjectId; n: number }>([
    {
      $match: {
        $or: clauses,
        sender: { $ne: new Types.ObjectId(userId) },
      },
    },
    { $group: { _id: "$thread", n: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.n]));
}

/** "Ms. Amal" - the honorific is on the profile, the name is on the account. */
function teacherLabel(teacher: ITeacher | undefined, user: IUser | undefined) {
  if (!user) return "Unknown";
  const name = `${user.firstName} ${user.lastName}`.trim();
  return teacher ? `${teacher.title} ${name}`.trim() : name;
}

/** "Fatima Ahmed (Mother)" - the relationship comes off the child, not the parent. */
function guardianLabel(
  user: IUser | undefined,
  relationship: GuardianRelationship | undefined,
) {
  if (!user) return "Unknown";
  const name = `${user.firstName} ${user.lastName}`.trim();
  return relationship
    ? `${name} (${GUARDIAN_RELATIONSHIP_LABEL[relationship]})`
    : name;
}

/**
 * Display names for a set of Teacher profiles, keyed by profile id.
 *
 * Exported because the recipient picker needs exactly the same wording the
 * transcript uses - a teacher who appears as "Ms. Amal" in a conversation must
 * not appear as "Amal Hassan" in the dropdown that starts it.
 */
export async function teacherLabelsFor(
  teacherIds: string[],
): Promise<Map<string, string>> {
  if (teacherIds.length === 0) return new Map();

  const teachers = await Teacher.find({ _id: { $in: teacherIds } });
  const users = await User.find({
    _id: { $in: teachers.map((t) => String(t.user)) },
  });
  const userMap = new Map(users.map((u) => [String(u._id), u as IUser]));

  return new Map(
    teachers.map((t) => [
      String(t._id),
      teacherLabel(t as ITeacher, userMap.get(String(t.user))),
    ]),
  );
}

/**
 * Everything a page of threads refers to by id, in a handful of `$in` lookups.
 *
 * Batched rather than `populate`d for the same reason as the gallery and
 * attendance hydrators: the same teacher and the same guardians recur across
 * every row of an inbox, so per-document population would re-read them once per
 * thread.
 */
export async function hydrateThreadRows(
  threads: IMessageThread[],
  viewerId: string,
): Promise<MessageThreadRow[]> {
  if (threads.length === 0) return [];

  const ids = <T,>(values: T[]) =>
    Array.from(new Set(values.filter(Boolean).map(String)));

  const [students, teachers, unread] = await Promise.all([
    Student.find({ _id: { $in: ids(threads.map((t) => t.student)) } }),
    Teacher.find({ _id: { $in: ids(threads.map((t) => t.teacher)) } }),
    unreadByThread(threads, viewerId),
  ]);

  // Guardians hang off the students, so their parent ids are only knowable
  // after the students are in hand - hence the second wave rather than one
  // bigger Promise.all.
  const parentIds = ids(
    students.flatMap((s) => s.guardians.map((g) => g.parent)),
  );
  const [parents, classrooms] = await Promise.all([
    Parent.find({ _id: { $in: parentIds } }),
    Classroom.find({ _id: { $in: ids(threads.map((t) => t.classroom)) } }),
  ]);

  const users = await User.find({
    _id: {
      $in: ids([
        ...teachers.map((t) => t.user),
        ...parents.map((p) => p.user),
      ]),
    },
  });

  const byId = <T extends { _id: unknown }>(docs: T[]) =>
    new Map(docs.map((d) => [String(d._id), d]));

  const studentMap = byId(students);
  const teacherMap = byId(teachers);
  const classroomMap = byId(classrooms);
  const userMap = byId(users);
  const parentMap = byId(parents);

  return threads.map((thread) => {
    const student = studentMap.get(String(thread.student));
    const teacher = teacherMap.get(String(thread.teacher));
    const classroom = classroomMap.get(String(thread.classroom));

    /*
     * Keyed on User id, because that is what `readState` records. The rows
     * above are keyed on profile ids - a Teacher and a Parent - which is
     * exactly the mismatch this map exists to bridge.
     */
    const labelByUser = new Map<string, string>();
    if (teacher) {
      const user = userMap.get(String(teacher.user));
      labelByUser.set(String(teacher.user), teacherLabel(teacher, user));
    }
    for (const guardian of student?.guardians ?? []) {
      const parent = parentMap.get(String(guardian.parent));
      if (!parent) continue;
      labelByUser.set(
        String(parent.user),
        guardianLabel(userMap.get(String(parent.user)), guardian.relationship),
      );
    }

    return {
      id: String(thread._id),
      student: {
        id: String(thread.student),
        fullName: student
          ? `${student.firstName} ${student.lastName}`.trim()
          : "Unknown",
      },
      teacher: {
        id: String(thread.teacher),
        label: teacherLabel(
          teacher,
          teacher ? userMap.get(String(teacher.user)) : undefined,
        ),
      },
      classroom: classroom
        ? { id: String(classroom._id), name: classroom.name }
        : null,
      guardians: (student?.guardians ?? []).map((g) => {
        const parent = parentMap.get(String(g.parent));
        return {
          id: String(g.parent),
          label: guardianLabel(
            parent ? userMap.get(String(parent.user)) : undefined,
            g.relationship,
          ),
        };
      }),
      lastMessage: thread.lastMessagePreview
        ? {
            preview: thread.lastMessagePreview,
            at: thread.lastMessageAt.toISOString(),
            mine: String(thread.lastMessageBy ?? "") === String(viewerId),
          }
        : null,
      unreadCount: unread.get(String(thread._id)) ?? 0,
      readReceipts: thread.readState
        .filter((r) => String(r.user) !== String(viewerId))
        // Anyone not in the map is not a participant - which is how the super
        // admin's own read position stays out of the family's view.
        .filter((r) => labelByUser.has(String(r.user)))
        .map((r) => ({
          id: String(r.user),
          label: labelByUser.get(String(r.user)) as string,
          at: r.lastReadAt.toISOString(),
        }))
        .sort((a, b) => b.at.localeCompare(a.at)),
      updatedAt: thread.updatedAt.toISOString(),
    };
  });
}

/**
 * Everyone on either side of a thread, as accounts rather than profiles.
 *
 * This is the fan-out list: who has to be told when a message lands, and whose
 * read position is anybody else's business. Resolved from the thread key the
 * same way `messageScope` resolves who may read it, so the set of people who
 * receive a live update can never drift from the set allowed to read it.
 */
export async function threadParticipants(
  thread: IMessageThread,
): Promise<ThreadParticipant[]> {
  const [teacher, student] = await Promise.all([
    Teacher.findById(thread.teacher),
    Student.findById(thread.student),
  ]);

  const parents = await Parent.find({
    _id: { $in: (student?.guardians ?? []).map((g) => g.parent) },
  });

  const users = await User.find({
    _id: {
      $in: [
        ...(teacher ? [teacher.user] : []),
        ...parents.map((p) => p.user),
      ],
    },
  });
  const userMap = new Map(users.map((u) => [String(u._id), u as IUser]));

  const relationshipByParent = new Map(
    (student?.guardians ?? []).map((g) => [String(g.parent), g.relationship]),
  );

  const participants: ThreadParticipant[] = [];
  if (teacher) {
    participants.push({
      id: String(teacher.user),
      label: teacherLabel(teacher as ITeacher, userMap.get(String(teacher.user))),
    });
  }
  for (const parent of parents) {
    participants.push({
      id: String(parent.user),
      label: guardianLabel(
        userMap.get(String(parent.user)),
        relationshipByParent.get(String(parent._id)),
      ),
    });
  }
  return participants;
}

export interface ThreadParticipant {
  /** User id. */
  id: string;
  label: string;
}

/** A message as it goes on the wire - everything but the per-reader `mine`. */
export function toWireMessage(row: MessageRow): Omit<MessageRow, "mine"> {
  return {
    id: row.id,
    body: row.body,
    sender: row.sender,
    createdAt: row.createdAt,
  };
}

/**
 * Names for the speakers in one thread's transcript.
 *
 * Scoped to a single thread on purpose: a guardian's label depends on how they
 * relate to *this* child, and the same person can be a mother in one thread and
 * a listed guardian in another.
 */
export async function hydrateMessageRows(
  messages: IMessage[],
  thread: IMessageThread,
  viewerId: string,
): Promise<MessageRow[]> {
  if (messages.length === 0) return [];

  const senderIds = Array.from(new Set(messages.map((m) => String(m.sender))));

  const [users, student, teachers, parents] = await Promise.all([
    User.find({ _id: { $in: senderIds } }),
    Student.findById(thread.student),
    Teacher.find({ user: { $in: senderIds } }),
    Parent.find({ user: { $in: senderIds } }),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u as IUser]));
  const teacherByUser = new Map(
    teachers.map((t) => [String(t.user), t as ITeacher]),
  );
  const parentByUser = new Map(parents.map((p) => [String(p.user), p]));

  const relationshipByParent = new Map(
    ((student as IStudent | null)?.guardians ?? []).map((g) => [
      String(g.parent),
      g.relationship,
    ]),
  );

  return messages.map((message) => {
    const senderId = String(message.sender);
    const user = userMap.get(senderId);

    let label: string;
    if (message.senderRole === USER_ROLE.PARENT) {
      const parent = parentByUser.get(senderId);
      label = guardianLabel(
        user,
        parent ? relationshipByParent.get(String(parent._id)) : undefined,
      );
    } else {
      label = teacherLabel(teacherByUser.get(senderId), user);
    }

    return {
      id: String(message._id),
      body: message.body,
      sender: { id: senderId, label, role: message.senderRole },
      mine: senderId === String(viewerId),
      createdAt: message.createdAt.toISOString(),
    };
  });
}

/**
 * Writes a message and brings its thread's inbox line up to date.
 *
 * The sender's own `lastReadAt` moves with it, in the same update: having just
 * written the message they have by definition read it, and leaving it behind
 * would show them their own words as unread mail until their next poll.
 *
 * Shared by both send paths - the one that starts a conversation with a first
 * message and the one that replies into an open one - so the denormalised
 * fields cannot fall out of step depending on which door the message came in.
 */
export async function appendMessage(
  thread: IMessageThread,
  session: SessionPayload,
  body: string,
): Promise<IMessage> {
  const message = await Message.create({
    thread: thread._id,
    sender: session.userId,
    senderRole: session.role,
    body,
  });

  const at = message.createdAt;
  const seen = thread.readState.some(
    (r) => String(r.user) === String(session.userId),
  );

  await MessageThread.updateOne(
    seen
      ? { _id: thread._id, "readState.user": session.userId }
      : { _id: thread._id },
    {
      $set: {
        lastMessageAt: at,
        lastMessagePreview: previewOf(message.body),
        lastMessageBy: session.userId,
        ...(seen ? { "readState.$.lastReadAt": at } : {}),
      },
      ...(seen
        ? {}
        : {
            $push: { readState: { user: session.userId, lastReadAt: at } },
          }),
    },
  );

  return message;
}

/**
 * Records that this participant has now seen everything in the thread, and
 * reports the moment it recorded - or null if they were already up to date.
 *
 * That guard used to be what kept an 8-second poll on an idle conversation
 * free. It earns its keep differently now: the return value is what stops a
 * "Seen" receipt being broadcast every time somebody re-opens a thread they
 * have already read.
 */
export async function markThreadRead(
  thread: IMessageThread,
  userId: string,
): Promise<Date | null> {
  if (lastReadAtFor(thread, userId) >= thread.lastMessageAt) return null;

  const now = new Date();
  const has = thread.readState.some((r) => String(r.user) === String(userId));

  await MessageThread.updateOne(
    has
      ? { _id: thread._id, "readState.user": userId }
      : { _id: thread._id },
    has
      ? { $set: { "readState.$.lastReadAt": now } }
      : { $push: { readState: { user: userId, lastReadAt: now } } },
    // Read tracking is bookkeeping, not content - it must not bump `updatedAt`
    // and reorder the other participant's inbox.
    { timestamps: false },
  );

  // The caller announces this over the socket, but only when it actually
  // moved - an idle reader must not emit a receipt per request.
  return now;
}
