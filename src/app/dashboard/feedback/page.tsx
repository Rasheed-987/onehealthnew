import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Feedback | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Feedback" description="Messages between the school and guardians." />
      <ComingSoon note="No model exists for this yet." />
    </>
  );
}
