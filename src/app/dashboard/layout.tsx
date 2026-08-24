import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requireUser } from "@/lib/auth";

/**
 * Guards every page under /dashboard.
 *
 * A layout runs before its pages, so this is the one auth check the whole
 * section needs - but it is not the last word: a page that reads a specific
 * child's record still has to run the row-level check from `permissions.ts`.
 */
export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const user = await requireUser();

  /*
   * An admin-set password gets you exactly as far as the change-password
   * screen. Enforced here rather than in the proxy, which never verifies the
   * cookie and cannot read this flag.
   */
  if (user.mustChangePassword) redirect("/change-password");

  return (
    <DashboardShell user={user}>
      {children}
    </DashboardShell>
  );
}
