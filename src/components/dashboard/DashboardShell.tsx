"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import type { CurrentUser } from "@/lib/auth";

/**
 * The chrome: sidebar, top bar, footer.
 *
 * A client component because the sidebar owns collapse/drawer state, but it
 * takes `children` as a slot - so every page inside it stays a server
 * component and can query Mongo directly.
 */
export function DashboardShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        role={user.role}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* min-w-0 so a wide table inside scrolls itself instead of stretching
          the whole grid and pushing the sidebar off screen. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 m-4 mb-0 flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-control p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="ml-auto">
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 p-4">{children}</main>

        <footer className="px-6 py-5 text-sm text-muted">
          COPYRIGHT &copy; {new Date().getFullYear()}{" "}
          <span className="font-semibold text-primary">MativeInc</span>, All
          rights Reserved
        </footer>
      </div>
    </div>
  );
}
