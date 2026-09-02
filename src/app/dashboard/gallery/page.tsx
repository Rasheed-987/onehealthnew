import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { USER_ROLE } from "@/models/enums";
import { GalleryClient } from "./GalleryClient";

export const metadata: Metadata = { title: "Gallery | Letters and Numbers" };

export default async function GalleryPage() {
  const user = await requireUser("/dashboard/gallery");
  // The same permission the routes enforce, so the nav never leads somewhere
  // that answers 403.
  if (!can(user.role, "gallery:list")) redirect("/dashboard");

  const descriptions: Partial<Record<typeof user.role, string>> = {
    [USER_ROLE.SUPER_ADMIN]:
      "Every photo shared with families. Whoever is tagged is exactly who can see it.",
    [USER_ROLE.TEACHER]:
      "Photos from your classrooms. Whoever is tagged is exactly who can see it.",
    [USER_ROLE.PARENT]: "Photos and clips of your children from their day.",
  };
  // Partial with a fallback: STUDENT is in the enum but not in `gallery:list`,
  // so the guard above has already redirected it.
  const description =
    descriptions[user.role] ?? "Photos and clips shared with guardians.";

  return (
    <>
      <PageHeader title="Gallery" description={description} />
      {/* Drawn from the same permission table the routes enforce, so a
          guardian never sees an action that would 403. */}
      <GalleryClient
        canCreate={can(user.role, "gallery:create")}
        canUpdate={can(user.role, "gallery:update")}
        canDelete={can(user.role, "gallery:delete")}
      />
    </>
  );
}
