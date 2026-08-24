import {
  Bell,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Clock,
  Heart,
  Home,
  Image,
  MessageSquare,
  UserPlus,
  User,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { USER_ROLE, type UserRole } from "@/models/enums";

/**
 * The sidebar, as data.
 *
 * `roles` is what decides whether a link is drawn. It is presentation only -
 * hiding a link is not access control, and every page behind these still runs
 * its own check. A parent who types the URL must be stopped by the page, not
 * by the absence of a link.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: readonly UserRole[];
}

export interface NavSection {
  /** Undefined for the ungrouped items that sit above the first heading. */
  title?: string;
  items: readonly NavItem[];
}

const STAFF = [USER_ROLE.SUPER_ADMIN, USER_ROLE.TEACHER] as const;
const EVERYONE = [
  USER_ROLE.SUPER_ADMIN,
  USER_ROLE.TEACHER,
  USER_ROLE.PARENT,
] as const;
const ADMIN_ONLY = [USER_ROLE.SUPER_ADMIN] as const;
/*
 * Nursery-age students are not expected to sign in, but the role exists and
 * login would succeed - so it gets the dashboard rather than an empty sidebar.
 */
const ALL_ROLES = Object.values(USER_ROLE);

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home, roles: ALL_ROLES },
    ],
  },
  {
    title: "Users Management",
    items: [
      {
        label: "Home Rooms",
        href: "/dashboard/home-rooms",
        icon: BookOpen,
        roles: STAFF,
      },
      {
        label: "Teachers",
        href: "/dashboard/teachers",
        icon: UserCheck,
        roles: ADMIN_ONLY,
      },
      {
        label: "Students",
        href: "/dashboard/students",
        icon: User,
        roles: EVERYONE,
      },
      {
        label: "Parents",
        href: "/dashboard/parents",
        icon: UserPlus,
        roles: ADMIN_ONLY,
      },
    ],
  },
  {
    title: "Progress and Reports",
    items: [
      {
        label: "Attendance Records",
        href: "/dashboard/attendance",
        icon: ClipboardList,
        roles: EVERYONE,
      },
      {
        label: "Daily Progress",
        href: "/dashboard/daily-progress",
        icon: Clock,
        roles: EVERYONE,
      },
      {
        label: "Weekly Progress",
        href: "/dashboard/weekly-progress",
        icon: CalendarClock,
        roles: EVERYONE,
      },
      {
        label: "Health Reports",
        href: "/dashboard/health-reports",
        icon: Heart,
        roles: EVERYONE,
      },
    ],
  },
  {
    title: "Features",
    items: [
      {
        label: "Gallery",
        href: "/dashboard/gallery",
        icon: Image,
        roles: EVERYONE,
      },
      {
        label: "Feedback",
        href: "/dashboard/feedback",
        icon: MessageSquare,
        roles: EVERYONE,
      },
      {
        label: "Notifications",
        href: "/dashboard/notifications",
        icon: Bell,
        roles: EVERYONE,
      },
    ],
  },
];

/** Drops links this role has no business seeing, and any section left empty. */
export function navFor(role: UserRole): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
}
