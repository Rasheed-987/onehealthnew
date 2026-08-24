import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { HomeRoomsClient } from "./HomeRoomsClient";

export const metadata: Metadata = { title: "Homerooms | Letters and Numbers" };

export default async function HomeRoomsPage() {
  const user = await requireUser("/dashboard/home-rooms");
  if (!can(user.role, "classroom:list")) redirect("/dashboard");

  return (
    <>
      <PageHeader
        title="Manage Homerooms"
        description="Classrooms, the teachers who run them and the children seated in them."
      />
      {/* Buttons are drawn from the same permission table the routes enforce,
          so a guardian never sees an action that would 403. */}
      <HomeRoomsClient
        canDelete={can(user.role, "classroom:delete")}
        canAssign={can(user.role, "enrollment:assign")}
      />
    </>
  );
}
