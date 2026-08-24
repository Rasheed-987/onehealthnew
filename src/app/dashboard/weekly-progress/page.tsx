import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Weekly Progress | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Weekly Progress" description="A week-at-a-glance summary per child." />
      <ComingSoon note="No model exists for this yet - it either rolls up DailyProgress or needs its own schema." />
    </>
  );
}
