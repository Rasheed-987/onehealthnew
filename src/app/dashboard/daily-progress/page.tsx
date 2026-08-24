import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Daily Progress | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Daily Progress" description="Meals, naps, nappy changes and mood for each child." />
      <ComingSoon note="Backed by the DailyProgress model." />
    </>
  );
}
