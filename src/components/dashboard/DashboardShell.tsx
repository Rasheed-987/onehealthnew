"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Search } from "lucide-react";

import { QuickSearchModal } from "./QuickSearchModal";
import { RealtimeProvider } from "./RealtimeProvider";
import { AppSidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/auth";

export function DashboardShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard shortcut listener: Cmd + K or Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <RealtimeProvider>
      <SidebarProvider>
        <AppSidebar role={user.role} />

        <SidebarInset className="bg-background">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
            <SidebarTrigger className="text-muted" />

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="relative hidden h-9 w-64 items-center rounded-control border border-border bg-surface-muted pl-9 pr-14 text-left text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground sm:flex lg:w-80"
            >
              <Search size={15} className="absolute left-3 text-subtle" />
              <span className="truncate">Search anything…</span>
              <kbd className="absolute right-2 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-subtle">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                className="text-muted sm:hidden"
                aria-label="Search"
              >
                <Search size={18} />
              </Button>

              <Button asChild variant="ghost" size="icon" className="relative text-muted" title="Notifications">
                <Link href="/dashboard/notifications">
                  <Bell size={18} />
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-danger-foreground">
                    3
                  </span>
                </Link>
              </Button>

              <div className="hidden h-6 w-px bg-border sm:block" />

              <UserMenu user={user} />
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>

          <footer className="px-6 py-5 text-xs font-medium text-muted">
            COPYRIGHT &copy; {new Date().getFullYear()}{" "}
            <span className="font-bold text-foreground">Letter &amp; Numbers</span> &bull;{" "}
            <span>All rights Reserved</span>
          </footer>
        </SidebarInset>
      </SidebarProvider>

      <QuickSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </RealtimeProvider>
  );
}
