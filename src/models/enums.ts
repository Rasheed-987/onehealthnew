/**
 * Shared enumerations for the school management schema.
 *
 * These are `as const` objects rather than TypeScript `enum`s so the values
 * survive as plain strings in Mongoose schemas and JSON responses, while the
 * derived union types still give compile-time safety.
 */

export const USER_ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  TEACHER: "TEACHER",
  PARENT: "PARENT",
  STUDENT: "STUDENT",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const USER_STATUS = {
  /** Can sign in. */
  ACTIVE: "ACTIVE",
  /** Created by an admin, has not set a password yet. */
  INVITED: "INVITED",
  /** Blocked from signing in, record retained. */
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const GENDER = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
} as const;
export type Gender = (typeof GENDER)[keyof typeof GENDER];

/**
 * How a guardian relates to a student. Drives the wording on contact cards and
 * pickup authorisation lists.
 */
export const GUARDIAN_RELATIONSHIP = {
  MOTHER: "MOTHER",
  FATHER: "FATHER",
  GUARDIAN: "GUARDIAN",
  OTHER: "OTHER",
} as const;
export type GuardianRelationship =
  (typeof GUARDIAN_RELATIONSHIP)[keyof typeof GUARDIAN_RELATIONSHIP];

/**
 * A classroom has exactly one LEAD (the "Class Teacher" column in the UI) and
 * any number of ASSISTANTs (the "Additional Teachers" column).
 */
export const CLASSROOM_TEACHER_ROLE = {
  LEAD: "LEAD",
  ASSISTANT: "ASSISTANT",
} as const;
export type ClassroomTeacherRole =
  (typeof CLASSROOM_TEACHER_ROLE)[keyof typeof CLASSROOM_TEACHER_ROLE];


/**
 * Grade levels currently offered. Kept as an enum for step one; if the super
 * admin ever needs to add grades without a deploy, this becomes its own
 * collection and `Classroom.gradeLevel` turns into an ObjectId ref.
 */
export const GRADE_LEVEL = {
  PRE_SCHOOL: "PRE_SCHOOL",
  NURSERY_1: "NURSERY_1",
  NURSERY_2: "NURSERY_2",
  NURSERY_3: "NURSERY_3",
  NURSERY_4: "NURSERY_4",
} as const;
export type GradeLevel = (typeof GRADE_LEVEL)[keyof typeof GRADE_LEVEL];

/** Display strings for grade levels, so the UI never hardcodes them. */
export const GRADE_LEVEL_LABEL: Record<GradeLevel, string> = {
  PRE_SCHOOL: "Pre-School (3-4 years)",
  NURSERY_1: "Nursery Level 1",
  NURSERY_2: "Nursery Level 2",
  NURSERY_3: "Nursery Level 3",
  NURSERY_4: "Nursery Level 4",
};

/** Honorific shown in front of a teacher's name, e.g. "Ms. Amal". */
export const TEACHER_TITLE = {
  MS: "Ms.",
  MRS: "Mrs.",
  MR: "Mr.",
  DR: "Dr.",
} as const;
export type TeacherTitle = (typeof TEACHER_TITLE)[keyof typeof TEACHER_TITLE];

/**
 * A student's standing in a classroom. Only one enrolment per student may be
 * ACTIVE at a time - see the partial unique index on Enrollment.
 */
export const ENROLLMENT_STATUS = {
  ACTIVE: "ACTIVE",
  /** Left the school. */
  WITHDRAWN: "WITHDRAWN",
  /** Moved up out of nursery. */
  GRADUATED: "GRADUATED",
  /** Moved to another classroom; the new enrolment carries ACTIVE. */
  TRANSFERRED: "TRANSFERRED",
} as const;
export type EnrollmentStatus =
  (typeof ENROLLMENT_STATUS)[keyof typeof ENROLLMENT_STATUS];

export const ATTENDANCE_STATUS = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  /** Arrived after the register was taken. */
  LATE: "LATE",
  /** Absent, but the guardian told the school in advance. */
  EXCUSED: "EXCUSED",
} as const;
export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

/**
 * Mood checkboxes on the daily sheet. Independent rather than exclusive - a
 * child can be recorded happy in the morning and quiet after nap - so
 * DailyProgress stores an array, and an empty array means "not recorded".
 */
export const MOOD = {
  HAPPY: "HAPPY",
  SAD: "SAD",
  QUIET: "QUIET",
} as const;
export type Mood = (typeof MOOD)[keyof typeof MOOD];

export const MOOD_LABEL: Record<Mood, string> = {
  HAPPY: "Happy",
  SAD: "Sad",
  QUIET: "Quiet",
};

/** What a nappy change found. */
export const TOILET_TYPE = {
  WET: "WET",
  POO: "POO",
  DRY: "DRY",
} as const;
export type ToiletType = (typeof TOILET_TYPE)[keyof typeof TOILET_TYPE];

export const TOILET_TYPE_LABEL: Record<ToiletType, string> = {
  WET: "wet",
  POO: "poo",
  DRY: "dry",
};

/** Supplies the guardian needs to send in tomorrow. */
export const SUPPLY_NEED = {
  DIAPERS: "DIAPERS",
  WIPES: "WIPES",
} as const;
export type SupplyNeed = (typeof SUPPLY_NEED)[keyof typeof SUPPLY_NEED];

export const SUPPLY_NEED_LABEL: Record<SupplyNeed, string> = {
  DIAPERS: "Diapers",
  WIPES: "Wipes",
};

/** What a gallery post is for. Shown as the "Type" column in the admin table. */
export const GALLERY_ITEM_TYPE = {
  UPDATE: "UPDATE",
  ACTIVITY: "ACTIVITY",
  EVENT: "EVENT",
  ACHIEVEMENT: "ACHIEVEMENT",
} as const;
export type GalleryItemType =
  (typeof GALLERY_ITEM_TYPE)[keyof typeof GALLERY_ITEM_TYPE];

export const GALLERY_ITEM_TYPE_LABEL: Record<GalleryItemType, string> = {
  UPDATE: "Update",
  ACTIVITY: "Activity",
  EVENT: "Event",
  ACHIEVEMENT: "Achievement",
};

export const MEDIA_KIND = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
} as const;
export type MediaKind = (typeof MEDIA_KIND)[keyof typeof MEDIA_KIND];

/**
 * Clock times inside a day - a nappy change at 08:50, a nap from 12:30.
 *
 * Stored as "HH:mm" strings rather than Dates: the owning document already
 * carries the day, and a bare time cannot drift across a timezone boundary the
 * way a Date can when the school and the server disagree about midnight.
 */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
