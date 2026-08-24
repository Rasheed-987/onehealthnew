import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Notifications | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Notifications" description="Announcements pushed to staff and guardians." />
      <ComingSoon note="No model exists for this yet." />
    </>
  );
}
