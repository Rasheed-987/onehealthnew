import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { NotificationsClient } from "./NotificationsClient";

export const metadata: Metadata = {
  title: "Notifications | Letters and Numbers",
};

export default async function NotificationsPage() {
  const user = await requireUser("/dashboard/notifications");
  // The same permission the routes enforce, so the nav never leads somewhere
  // that answers 403.
  if (!can(user.role, "notification:list")) redirect("/dashboard");

  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "Announcements from the school. Choose who each one is for before you send it.",
    [USER_ROLE.TEACHER]: "Announcements from the school for you and your rooms.",
    [USER_ROLE.PARENT]: "Announcements from the school for you and your children.",
  };
  const description =
    descriptions[user.role] ?? "Announcements from the school.";

  return (
    <>
      <PageHeader title="Notifications" description={description} />
      {/* Drawn from the same permission table the routes enforce, so a reader
          never sees an action that would 403. */}
      <NotificationsClient canManage={can(user.role, "notification:create")} />
    </>
  );
}
