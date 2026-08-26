import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { HealthReportsClient } from "./HealthReportsClient";

export const metadata: Metadata = {
  title: "Health Reports | Letters and Numbers",
};

export default async function HealthReportsPage() {
  const user = await requireUser("/dashboard/health-reports");
  // The sidebar already hides this link from anyone without it, but hiding a
  // link is not access control - a typed URL has to be stopped here.
  if (!can(user.role, "health:list")) redirect("/dashboard");

  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "Every clinical visit recorded across the school.",
    [USER_ROLE.TEACHER]:
      "Clinical visits for the children in your classrooms.",
    [USER_ROLE.PARENT]:
      "Times your child was seen by the nurse, and what was done.",
  };

  return (
    <>
      <PageHeader
        title="Health Reports"
        description={
          descriptions[user.role] ?? "Clinical visits, care given, and outcomes."
        }
      />
      <HealthReportsClient
        canRecord={can(user.role, "health:write")}
        canDelete={can(user.role, "health:delete")}
      />
    </>
  );
}
