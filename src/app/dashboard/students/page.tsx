import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { StudentsClient } from "./StudentsClient";

export const metadata: Metadata = { title: "Students | Letters and Numbers" };

export default async function StudentsPage() {
  const user = await requireUser("/dashboard/students");
  if (!can(user.role, "student:list")) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Students"
        description={
          can(user.role, "student:delete")
            ? "Children enrolled at the school and the guardians responsible for them."
            : "Your children and the guardians linked to them."
        }
      />
      {/* Only a super admin may delete, so the button is not drawn for anyone
          else - the route enforces it regardless. */}
      <StudentsClient canDelete={can(user.role, "student:delete")} />
    </>
  );
}
