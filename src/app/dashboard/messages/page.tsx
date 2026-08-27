import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { MessagesClient } from "./MessagesClient";

export const metadata: Metadata = { title: "Messages | Letters and Numbers" };

export default async function MessagesPage() {
  const user = await requireUser("/dashboard/messages");
  // The same permission the routes enforce, so the nav never leads somewhere
  // that answers 403.
  if (!can(user.role, "message:list")) redirect("/dashboard");

  /*
   * The wording is load-bearing, not decoration. A thread is shared by every
   * guardian of the child, and a super admin can read all of them - neither is
   * something a family should discover afterwards, so both are said here.
   */
  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "Every conversation between staff and families. You can read these; replies come from the child's teacher.",
    [USER_ROLE.TEACHER]:
      "One conversation per child. Everyone listed as that child's guardian can see it.",
    [USER_ROLE.PARENT]:
      "Talk to your child's teacher. Your child's other guardians can see this conversation too.",
  };
  const description =
    descriptions[user.role] ?? "Conversations between teachers and families.";

  return (
    <>
      <PageHeader title="Messages" description={description} />
      {/* Drawn from the same permission table the routes enforce, so the super
          admin is never shown a composer that would 403. */}
      <MessagesClient canSend={can(user.role, "message:send")} />
    </>
  );
}
