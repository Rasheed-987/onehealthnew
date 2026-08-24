import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Attendance Records | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Attendance Records" description="The daily register, one line per child per day." />
      <ComingSoon note="Backed by the Attendance model." />
    </>
  );
}
