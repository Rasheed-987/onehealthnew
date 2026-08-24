import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { TeachersClient } from "./TeachersClient";

export const metadata: Metadata = { title: "Teachers | Letters and Numbers" };

export default async function TeachersPage() {
  const user = await requireUser("/dashboard/teachers");
  // The sidebar hides this link for non-admins, but hiding a link is not a
  // check - someone typing the URL has to be stopped here.
  if (!can(user.role, "teacher:create")) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Staff accounts, their profiles and the classrooms they are on."
      />
      <TeachersClient />
    </>
  );
}
