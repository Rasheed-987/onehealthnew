/**
 * Import from here rather than the individual files.
 *
 * Touching this module registers every schema on the Mongoose instance, which
 * matters because `populate()` throws MissingSchemaError if a referenced model
 * has not been registered yet - easy to hit in Next.js, where only the modules
 * a given route imports are ever evaluated.
 */

export * from "./enums";
export { startOfDayUTC, toDayKey } from "./day";

export { User, type IUser } from "./User";
export { Teacher, type ITeacher } from "./Teacher";
export { Parent, type IParent } from "./Parent";
export { Student, type IStudent, type IStudentGuardian } from "./Student";
export { Classroom, type IClassroom, type IClassroomTeacher } from "./Classroom";
export {
  Enrollment,
  type IEnrollment,
  type IEnrollmentModel,
} from "./Enrollment";
export { Attendance, type IAttendance } from "./Attendance";
export {
  DailyProgress,
  type IDailyProgress,
  type IDrinkEntry,
  type IToiletEntry,
  type INapEntry,
} from "./DailyProgress";
export { GalleryItem, type IGalleryItem } from "./GalleryItem";
export {
  VerificationToken,
  TOKEN_TYPE,
  type IVerificationToken,
  type TokenType,
} from "./VerificationToken";
