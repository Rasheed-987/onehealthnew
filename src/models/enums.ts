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

export const GUARDIAN_RELATIONSHIP_LABEL: Record<GuardianRelationship, string> =
  {
    MOTHER: "Mother",
    FATHER: "Father",
    GUARDIAN: "Guardian",
    OTHER: "Guardian",
  };

/**
 * How long a guardian keeps reading a child's records after that child leaves.
 *
 * Not zero, because the day a family withdraws is exactly when they want to
 * download the photos and the daily sheets from the year they paid for, and
 * cutting them off at the moment the enrolment closes turns that into a support
 * request. Not unbounded either - see `guardedStudentIds`, where a missing
 * enrolment condition previously meant access never ended at all.
 */
export const GUARDIAN_ACCESS_GRACE_DAYS = 30;
export const GUARDIAN_ACCESS_GRACE_MS =
  GUARDIAN_ACCESS_GRACE_DAYS * 24 * 60 * 60 * 1000;

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

/**
 * A guardian's request to be linked to a child they named by student ID.
 *
 * Filed by the parent from the app, decided by staff. Terminal rows are kept
 * rather than deleted for the same reason enrolments are: "who asked for access
 * to this child, and who let them in" is a question the school will be asked,
 * and a deleted row cannot answer it.
 *
 * CANCELLED is the parent withdrawing their own request; REJECTED is the school
 * refusing it. Distinct because only one of the two is a safeguarding signal.
 */
export const GUARDIAN_LINK_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type GuardianLinkStatus =
  (typeof GUARDIAN_LINK_STATUS)[keyof typeof GUARDIAN_LINK_STATUS];

export const GUARDIAN_LINK_STATUS_LABEL: Record<GuardianLinkStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
};

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
 * The clinical visit form, section by section.
 *
 * Sections 01-04 are checkbox groups: a child can arrive with a fever AND a
 * cough, so each is an array on the record and an empty array means "nothing
 * ticked". Section 05 is the one exclusive choice - a visit ends exactly one
 * way - so VISIT_OUTCOME is a single required value, not a list.
 *
 * Sections 01 and 03 each have an "Other ..." free-text box on the form. Those
 * are separate string fields on the record rather than members here: an enum
 * value that carries its own text is not an enum value.
 */

/** Section 01. */
export const FLU_SYMPTOM = {
  FEVER: "FEVER",
  COUGH: "COUGH",
  RUNNY_NOSE: "RUNNY_NOSE",
  NASAL_CONGESTION: "NASAL_CONGESTION",
} as const;
export type FluSymptom = (typeof FLU_SYMPTOM)[keyof typeof FLU_SYMPTOM];

export const FLU_SYMPTOM_LABEL: Record<FluSymptom, string> = {
  FEVER: "Fever",
  COUGH: "Cough",
  RUNNY_NOSE: "Runny Nose",
  NASAL_CONGESTION: "Nasal Congestion",
};

/** Section 02. */
export const OTHER_SYMPTOM = {
  HEADACHE: "HEADACHE",
  RASH: "RASH",
  DIARRHEA: "DIARRHEA",
  NAUSEA_VOMITING: "NAUSEA_VOMITING",
} as const;
export type OtherSymptom = (typeof OTHER_SYMPTOM)[keyof typeof OTHER_SYMPTOM];

export const OTHER_SYMPTOM_LABEL: Record<OtherSymptom, string> = {
  HEADACHE: "Headache",
  RASH: "Rash",
  DIARRHEA: "Diarrhea",
  NAUSEA_VOMITING: "Nausea / Vomiting",
};

/** Section 03 - injuries and the things a nursery checks for by hand. */
export const ADDITIONAL_SYMPTOM = {
  NOSE_BLEEDING: "NOSE_BLEEDING",
  HEAD_LICE: "HEAD_LICE",
  INJURY_WOUND: "INJURY_WOUND",
} as const;
export type AdditionalSymptom =
  (typeof ADDITIONAL_SYMPTOM)[keyof typeof ADDITIONAL_SYMPTOM];

export const ADDITIONAL_SYMPTOM_LABEL: Record<AdditionalSymptom, string> = {
  NOSE_BLEEDING: "Nose Bleeding",
  HEAD_LICE: "Head Lice / Nits",
  INJURY_WOUND: "Injury / Wound",
};

/** Section 04 - what was actually done for the child. */
export const NURSING_CARE = {
  REST_REASSURANCE: "REST_REASSURANCE",
  ICE_PACK: "ICE_PACK",
  WOUND_CARE: "WOUND_CARE",
  SUPPORTIVE_BANDAGE: "SUPPORTIVE_BANDAGE",
  TEPID_SPONGE_BATH: "TEPID_SPONGE_BATH",
} as const;
export type NursingCare = (typeof NURSING_CARE)[keyof typeof NURSING_CARE];

export const NURSING_CARE_LABEL: Record<NursingCare, string> = {
  REST_REASSURANCE: "Rest & Reassurance",
  ICE_PACK: "Ice Pack Applied",
  WOUND_CARE: "Wound Care",
  SUPPORTIVE_BANDAGE: "Supportive Bandage",
  TEPID_SPONGE_BATH: "Tepid Sponge Bath",
};

/**
 * Section 05 - how the visit ended. Required, and deliberately ordered from
 * least to most serious, which is also the order the table's badge tones run.
 */
export const VISIT_OUTCOME = {
  RETURN_TO_CLASS: "RETURN_TO_CLASS",
  SENT_HOME: "SENT_HOME",
  NURSERY_CLINIC: "NURSERY_CLINIC",
  AMBULANCE_TO_HOSPITAL: "AMBULANCE_TO_HOSPITAL",
} as const;
export type VisitOutcome = (typeof VISIT_OUTCOME)[keyof typeof VISIT_OUTCOME];

export const VISIT_OUTCOME_LABEL: Record<VisitOutcome, string> = {
  RETURN_TO_CLASS: "Return to Class",
  SENT_HOME: "Sent Home",
  NURSERY_CLINIC: "Nursery Clinic",
  AMBULANCE_TO_HOSPITAL: "Ambulance to Hospital",
};

/**
 * Messaging limits.
 *
 * Here rather than beside the schemas because the composer needs the length cap
 * to set `maxLength` on its textarea, and a client component cannot value-import
 * a module that pulls in Mongoose. This file is the Mongoose-free half the
 * browser is allowed to read.
 */

/** Longest a single message may be. Enforced by the schema and the composer. */
export const MESSAGE_MAX_LENGTH = 4000;

/** How much of the last message an inbox row shows. */
export const PREVIEW_LENGTH = 140;

/**
 * Clock times inside a day - a nappy change at 08:50, a nap from 12:30.
 *
 * Stored as "HH:mm" strings rather than Dates: the owning document already
 * carries the day, and a bare time cannot drift across a timezone boundary the
 * way a Date can when the school and the server disagree about midnight.
 */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Guardian feedback about the app and the nursery.
 *
 * Two ratings sit side by side on the form and they are not redundant.
 * `experience` is the word a parent would use out loud - it is what the admin
 * table groups and skims by. `stars` is the number, which is the only one of
 * the two you can average. Asking for both costs the parent one extra tap and
 * saves the school from inferring a sentiment from a 3.
 */
export const FEEDBACK_EXPERIENCE = {
  EXCELLENT: "EXCELLENT",
  GOOD: "GOOD",
  AVERAGE: "AVERAGE",
  POOR: "POOR",
} as const;
export type FeedbackExperience =
  (typeof FEEDBACK_EXPERIENCE)[keyof typeof FEEDBACK_EXPERIENCE];

export const FEEDBACK_EXPERIENCE_LABEL: Record<FeedbackExperience, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  AVERAGE: "Average",
  POOR: "Poor",
};

/**
 * The star scale. One and five rather than zero and five: a submitted rating
 * of "no stars" is indistinguishable from a rating nobody filled in, and the
 * form makes the field required precisely so that ambiguity cannot arise.
 */
export const FEEDBACK_MIN_STARS = 1;
export const FEEDBACK_MAX_STARS = 5;

/**
 * Longest a comment may be. Here rather than beside the schema for the same
 * reason as MESSAGE_MAX_LENGTH: the composer needs it for `maxLength` on its
 * textarea, and a client component cannot value-import a Mongoose module.
 */
export const FEEDBACK_MAX_LENGTH = 2000;
