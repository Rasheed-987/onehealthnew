"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { useUnreadCount } from "@/components/dashboard/useUnreadCount";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
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

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-2.5">
        <Link
          href="/dashboard"
          onClick={() => setOpenMobile(false)}
          className="flex min-w-0 items-center gap-2.5 py-0.5"
          aria-label="Letters and Numbers home"
        >
          <BrandMark
            showText={!collapsed}
            className={collapsed ? "h-9 w-9" : "h-11 w-11"}
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section, index) => (
          <SidebarGroup key={section.title ?? `section-${index}`}>
            {section.title && !collapsed && (
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  const count = item.badge === "messages" ? unread : 0;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setOpenMobile(false)}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge className="bg-danger text-danger-foreground">
                          {count > 99 ? "99+" : count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
