import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { DailyProgressClient } from "./DailyProgressClient";

export const metadata: Metadata = {
  title: "Daily Progress | Letters and Numbers",
};

export default async function DailyProgressPage() {
  const user = await requireUser("/dashboard/daily-progress");
  // The same permission the routes enforce, so the nav never leads somewhere
  // that answers 403.
  if (!can(user.role, "progress:list")) redirect("/dashboard");

  /*
   * The nav lists this page for everyone and `progress:list` admits all three
   * roles - a guardian reading their own child's sheet is the point of the
   * feature, not a leak. So the wording has to cover a parent too.
   */
  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "Drinks, moods, nappy changes, naps and needs for every child, one sheet per child per day.",
    [USER_ROLE.TEACHER]:
      "Drinks, moods, nappy changes, naps and needs for the children in your classrooms.",
    [USER_ROLE.PARENT]:
      "How your child's day went - drinks, mood, naps and what to send in tomorrow.",
  };
  // Partial with a fallback: STUDENT is in the enum but not in `progress:list`,
  // so the guard above has already redirected it.
  const description =
    descriptions[user.role] ?? "The daily sheet, one per child per day.";

  return (
    <>
      <PageHeader title="Daily Progress" description={description} />
      {/* Drawn from the same permission table the routes enforce, so a
          guardian never sees an action that would 403. Staff get the
          roster view and the editable sheet; a parent gets a read-only
          list of their own children. */}
      <DailyProgressClient canRecord={can(user.role, "progress:write")} />
    </>
  );
}
