import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LinkRequestsClient } from "./LinkRequestsClient";

export const metadata: Metadata = {
  title: "Link Requests | Letters and Numbers",
};

export default async function LinkRequestsPage() {
  const user = await requireUser("/dashboard/link-requests");
  // The sidebar hides this link for guardians, but hiding a link is not a
  // check - someone typing the URL has to be stopped here.
  if (!can(user.role, "guardianLink:list")) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Link Requests"
        description="Guardians who signed up in the app and asked to be linked to a child. Approving one gives that guardian access to the child's records."
      />
      <LinkRequestsClient />
    </>
  );
}
