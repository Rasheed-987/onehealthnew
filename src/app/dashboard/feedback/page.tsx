import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { FeedbackClient } from "./FeedbackClient";

export const metadata: Metadata = { title: "Feedback | Letters and Numbers" };

export default async function FeedbackPage() {
  const user = await requireUser("/dashboard/feedback");
  // The sidebar hides this link for teachers, but hiding a link is not a check
  // - someone typing the URL has to be stopped here. Same permission the
  // routes enforce, so the nav never leads somewhere that answers 403.
  if (!can(user.role, "feedback:list")) redirect("/dashboard");

  const isGuardian = user.role === USER_ROLE.PARENT;

  return (
    <>
      <PageHeader
        title="Feedback"
        description={
          isGuardian
            ? "Tell us how the app and the nursery are working for you."
            : "What families have said about the app and the nursery."
        }
      />
      {/* Drawn from the same permission table the routes enforce, so nobody
          sees an action that would 403. */}
      <FeedbackClient
        canSubmit={can(user.role, "feedback:create")}
        canDelete={can(user.role, "feedback:delete")}
      />
    </>
  );
}
