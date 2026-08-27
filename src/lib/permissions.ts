import { USER_ROLE, type UserRole } from "@/models/enums";

/**
 * Who may perform which action.
 *
 * This is the coarse, role-level gate: "can a teacher create classrooms at
 * all?". It deliberately does NOT answer "may THIS parent edit THAT student" -
 * that is a row-level question and needs the record in hand. See `isGuardianOf`
 * and `teachesClassroom` below.
 */
export const PERMISSIONS = {
  // Only the super admin manages staff and guardian accounts.
  "teacher:create": [USER_ROLE.SUPER_ADMIN],
  "teacher:update": [USER_ROLE.SUPER_ADMIN],
  "teacher:delete": [USER_ROLE.SUPER_ADMIN],

  "parent:create": [USER_ROLE.SUPER_ADMIN],
  "parent:update": [USER_ROLE.SUPER_ADMIN],
  "parent:delete": [USER_ROLE.SUPER_ADMIN],

  // Admins and teachers add any student; a parent may add their own children.
  "student:create": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],
  "student:update": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],
  "student:delete": [USER_ROLE.SUPER_ADMIN],
  "student:list": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],

  // Teachers run their own rooms.
  "classroom:create": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "classroom:update": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "classroom:delete": [USER_ROLE.SUPER_ADMIN],
  "classroom:list": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],

  // Seating students.
  "enrollment:assign": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "enrollment:remove": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],

  // Putting teachers on a classroom.
  "classroom:assignTeacher": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],

  // Taking the register. Guardians read their own child's lines but never
  // write one - an absence is reported to the school, not entered by the home.
  "attendance:mark": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "attendance:delete": [USER_ROLE.SUPER_ADMIN],
  "attendance:list": [
    USER_ROLE.SUPER_ADMIN,
    USER_ROLE.TEACHER,
    USER_ROLE.PARENT,
  ],

  // The daily sheet. Same shape: staff write it, the home reads it.
  "progress:write": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "progress:delete": [USER_ROLE.SUPER_ADMIN],
  "progress:list": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],

  // Clinical visits. Same shape again: staff write, the home reads. A guardian
  // must never be able to enter a symptom against their own child - the record
  // is the school's account of what it saw and did.
  "health:write": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "health:delete": [USER_ROLE.SUPER_ADMIN],
  "health:list": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],

  // Photos and clips.
  "gallery:create": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "gallery:update": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "gallery:delete": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER],
  "gallery:list": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],

  // Conversations between a teacher and a child's guardians.
  //
  // The asymmetry is the point: the super admin reads every thread, for
  // safeguarding, but is deliberately absent from `message:send`. A reply from
  // an unexpected sender, in a conversation a family believes is with their
  // child's teacher, is worse than no reply - so the read-only rule lives here
  // in the table rather than as a branch inside a handler.
  "message:list": [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER, USER_ROLE.PARENT],
  "message:send": [USER_ROLE.TEACHER, USER_ROLE.PARENT],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Role-level check. Always pair with a scope check for parents and teachers. */
export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

/** Throwing variant, for the top of a server action or route handler. */
export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Role ${role} is not allowed to ${permission}.`);
  }
}

/**
 * Row-level scope: a parent may only touch students they are a guardian of.
 * Pass the parent's *Parent profile id*, not their user id.
 */
export function isGuardianOf(
  parentId: string,
  student: { guardians: { parent: unknown }[] },
): boolean {
  return student.guardians.some((g) => String(g.parent) === String(parentId));
}

/**
 * Row-level scope: a teacher is on the roster for this classroom.
 * Pass the teacher's *Teacher profile id*, not their user id.
 */
export function teachesClassroom(
  teacherId: string,
  classroom: { teachers: { teacher: unknown }[] },
): boolean {
  return classroom.teachers.some(
    (t) => String(t.teacher) === String(teacherId),
  );
}

/**
 * Row-level scope for attendance lines and daily sheets, both of which name a
 * single student. Pass the ids of the students this parent is a guardian of -
 * `Student.find({ "guardians.parent": parentId }).distinct("_id")`.
 */
export function ownsStudentRecord(
  guardedStudentIds: readonly unknown[],
  record: { student: unknown },
): boolean {
  return guardedStudentIds.some(
    (id) => String(id) === String(record.student),
  );
}

/**
 * Row-level scope for the gallery: a guardian sees an item only if one of
 * their own children is tagged on it. The tags are the audience - there is no
 * separate visibility flag to fall out of sync with them.
 */
export function canReadGalleryItem(
  guardedStudentIds: readonly unknown[],
  item: { students: readonly unknown[] },
): boolean {
  const mine = new Set(guardedStudentIds.map(String));
  return item.students.some((s) => mine.has(String(s)));
}
