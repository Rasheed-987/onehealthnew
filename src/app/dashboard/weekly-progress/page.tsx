import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { WeeklyProgressClient } from "./WeeklyProgressClient";

export const metadata: Metadata = {
  title: "Weekly Progress | Letters and Numbers",
};

export default async function WeeklyProgressPage() {
  const user = await requireUser("/dashboard/weekly-progress");
  /*
   * `progress:list`, not a permission of its own. A week is seven daily
   * sheets read together and nothing more, so anyone allowed to read the
   * sheets is by definition allowed to read the week - a separate string
   * would be one more thing to keep in step for no extra safety.
   */
  if (!can(user.role, "progress:list")) redirect("/dashboard");

  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "Seven days of daily sheets per child, so the gaps show up as clearly as the entries.",
    [USER_ROLE.TEACHER]:
      "Your week at a glance - who has been written up, who has not, and what to send home about.",
    [USER_ROLE.PARENT]:
      "Your child's week - how they slept, how they were, and what to send in.",
  };
  // Partial with a fallback: STUDENT is in the enum but not in `progress:list`,
  // so the guard above has already redirected it.
  const description =
    descriptions[user.role] ?? "A week of daily sheets, per child.";

  return (
    <>
      <PageHeader title="Weekly Progress" description={description} />
      {/* Read-only by design: the week is a roll-up, and a wrong week is
          corrected on the day it is wrong on. `canRecord` only decides
          whether a classroom picker and a link back to the sheet render -
          the API scopes the data either way. */}
      <WeeklyProgressClient canRecord={can(user.role, "progress:write")} />
    </>
  );
}
