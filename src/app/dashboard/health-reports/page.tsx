import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Health Reports | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Health Reports" description="Incidents, medication and health notes." />
      <ComingSoon note="No model exists for this yet." />
    </>
  );
}
