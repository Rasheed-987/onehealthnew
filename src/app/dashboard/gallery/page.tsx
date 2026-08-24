import type { Metadata } from "next";

import { ComingSoon, PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Gallery | Letters and Numbers" };

export default function Page() {
  return (
    <>
      <PageHeader title="Gallery" description="Photos and clips shared with the children's guardians." />
      <ComingSoon note="Backed by the GalleryItem model." />
    </>
  );
}
