"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { useUnreadCount } from "@/components/dashboard/useUnreadCount";
import { navFor } from "@/lib/nav";
import type { UserRole } from "@/models/enums";

/**
 * `/dashboard` would otherwise light up for every child route, since they all
 * start with it. Exact match for the index, prefix match for the rest.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  role,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: {
  role: UserRole;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  // Built here rather than passed in: each item carries its icon *component*,
  // and a function cannot cross the server -> client boundary as a prop.
  const sections = useMemo(() => navFor(role), [role]);

  /*
   * Only asked for when this role actually has the badged link. A student, who
   * has no messaging permission, would otherwise poll an endpoint that answers
   * 403 once a minute for as long as they stay signed in.
   */
  const wantsUnread = useMemo(
    () =>
      sections.some((section) =>
        section.items.some((item) => item.badge === "messages"),
      ),
    [sections],
  );
  const unread = useUnreadCount(wantsUnread);

  return (
    <>
      {/* Scrim. Only rendered on mobile, where the sidebar is an overlay. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-charcoal-950/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          collapsed ? "w-[76px]" : "w-[260px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 px-4 pt-5">
          <Link
            href="/dashboard"
            onClick={onCloseMobile}
            className="flex min-w-0 flex-1 items-center justify-center rounded-control"
            aria-label="Letters and Numbers home"
          >
            <BrandMark className={collapsed ? "h-11 w-11" : "h-20 w-20"} />
          </Link>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden shrink-0 rounded-control p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground lg:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="shrink-0 rounded-control p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-6">
          {sections.map((section, index) => (
            <div key={section.title ?? `section-${index}`} className="mb-5">
              {section.title && !collapsed && (
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
                  {section.title}
                </p>
              )}
              {/* Collapsed: a rule stands in for the heading, so the groups
                  stay visually separated without the text. */}
              {section.title && collapsed && (
                <div className="mx-3 mb-3 border-t border-sidebar-border" />
              )}

              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  const count = item.badge === "messages" ? unread : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onCloseMobile}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={[
                          "flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors",
                          collapsed ? "justify-center" : "",
                          active
                            ? "bg-sidebar-active font-semibold text-sidebar-active-foreground shadow-card"
                            : "text-sidebar-foreground hover:bg-sidebar-hover",
                        ].join(" ")}
                      >
                        <span className="relative shrink-0">
                          <Icon size={18} />
                          {/* Collapsed, the label is gone and the count with
                              it - so the icon carries a dot instead, which
                              still says "something is waiting". */}
                          {count > 0 && collapsed && (
                            <span
                              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        {!collapsed && (
                          <>
                            <span className="truncate">{item.label}</span>
                            {count > 0 && (
                              <span className="ml-auto inline-flex min-w-5 shrink-0 justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                                {count > 99 ? "99+" : count}
                              </span>
                            )}
                          </>
                        )}
                        {count > 0 && (
                          <span className="sr-only">
                            {count} unread {count === 1 ? "message" : "messages"}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
