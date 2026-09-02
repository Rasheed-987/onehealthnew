import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { AttendanceClient } from "./AttendanceClient";

export const metadata: Metadata = {
  title: "Attendance Records | Letters and Numbers",
};

export default async function AttendancePage() {
  const user = await requireUser("/dashboard/attendance");
  // The same permission the route enforces, so the nav never leads somewhere
  // that answers 403.
  if (!can(user.role, "attendance:list")) redirect("/dashboard");

  /*
   * The nav lists this page for everyone, and `attendance:list` admits all
   * three roles - a guardian reading their own child's register is a feature,
   * not a leak. So the wording has to cover a parent too.
   */
  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "The daily register across every classroom, one line per child per day.",
    [USER_ROLE.TEACHER]:
      "The daily register for your classrooms, one line per child per day.",
    [USER_ROLE.PARENT]:
      "The daily register for your children, one line per child per day.",
  };
  // Partial, and with a fallback: STUDENT is a role in the enum but is not in
  // `attendance:list`, so the guard above has already redirected it. The
  // fallback is what a fourth listed role would get, not dead code.
  const description =
    descriptions[user.role] ?? "The daily register, one line per child per day.";

  return (
    <>
      {/* Role shows up here as wording only. What the page can actually read
          is decided server-side by resolveAttendanceScope, never by this. */}
      <PageHeader title="Attendance Records" description={description} />
      {/* Marking is a rendering hint only - `POST /api/attendance` re-checks
          `attendance:mark` and that the room is the caller's to write. */}
      <AttendanceClient canRecord={can(user.role, "attendance:mark")} />
    </>
  );
}
