import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ParentsClient } from "./ParentsClient";

export const metadata: Metadata = { title: "Parents | Letters and Numbers" };

export default async function ParentsPage() {
  const user = await requireUser("/dashboard/parents");
  // The sidebar hides this link for non-admins, but hiding a link is not a
  // check - someone typing the URL has to be stopped here.
  if (!can(user.role, "parent:create")) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Parents"
        description="Guardian accounts and the children linked to them."
      />
      <ParentsClient />
    </>
  );
}
