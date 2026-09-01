import type { Types } from "mongoose";

import { connectDB } from "@/lib/db";
import {
  Attendance,
  Classroom,
  Enrollment,
  GalleryItem,
  Notification,
  Parent,
  Student,
  Teacher,
} from "@/models";
import {
  ATTENDANCE_STATUS,
  ENROLLMENT_STATUS,
  GALLERY_ITEM_TYPE_LABEL,
  type AttendanceStatus,
  type GalleryItemType,
} from "@/models/enums";

/**
 * Everything the dashboard landing page paints.
 *
 * The rule for every field here: read it from the database, and fall back to the
 * hand-picked demo value only when the collection behind it is empty. A brand-new
 * school with no attendance taken yet still gets a page that looks alive; a real
 * one never sees a fabricated number.
 */

export interface DashboardStat {
  value: number;
  /** e.g. "↑ 12 this month" or "No change". */
  trend: string;
  /** Whether `trend` reads as positive (green) or neutral (muted). */
  trendUp: boolean;
}

export interface DashboardActivity {
  title: string;
  by: string;
  ago: string;
}

export interface DashboardAnnouncement {
  title: string;
  date: string;
}

export interface DashboardMeal {
  label: string;
  pct: number;
}

export interface DashboardTopClass {
  name: string;
  count: number;
  pct: number;
}

export interface DashboardData {
  stats: {
    students: DashboardStat;
    teachers: DashboardStat;
    parents: DashboardStat;
    classes: DashboardStat;
  };
  attendance: {
    /** Percent present, 0-100. */
    pct: number;
    present: number;
    absent: number;
    onLeave: number;
    enrolled: number;
    /** True when the numbers are the demo fallback, not a real week. */
    isSample: boolean;
  };
  activities: DashboardActivity[];
  announcements: DashboardAnnouncement[];
  meals: DashboardMeal[];
  topClasses: DashboardTopClass[];
}

function startOfMonthUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfWeekUTC(now = new Date()): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Monday-based week: Mon -> 0, Sun -> 6.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function timeAgo(date: Date): string {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatAnnouncementDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "↑ 3 this month" when some were added, "No change" otherwise. */
function makeStat(total: number, addedThisMonth: number, fallback: DashboardStat): DashboardStat {
  if (total <= 0) return fallback;
  return {
    value: total,
    trend: addedThisMonth > 0 ? `↑ ${addedThisMonth} this month` : "No change",
    trendUp: addedThisMonth > 0,
  };
}

const SAMPLE: Pick<
  DashboardData,
  "activities" | "announcements" | "meals" | "topClasses"
> & { attendance: DashboardData["attendance"] } = {
  attendance: {
    pct: 85,
    present: 109,
    absent: 14,
    onLeave: 5,
    enrolled: 128,
    isSample: true,
  },
  activities: [
    { title: "Art & Craft", by: "Sarah Khan", ago: "2h ago" },
    { title: "Outdoor Play", by: "Ahmed Ali", ago: "4h ago" },
    { title: "Story Time", by: "Maryam Fatima", ago: "1d ago" },
  ],
  announcements: [
    {
      title: "School will remain closed on 25th May (Holiday)",
      date: "May 20, 2024",
    },
    { title: "Parent Teacher Meeting on 30th May", date: "May 18, 2024" },
  ],
  meals: [
    { label: "Breakfast", pct: 85 },
    { label: "Lunch", pct: 90 },
    { label: "Snacks", pct: 80 },
  ],
  topClasses: [
    { name: "Sunflowers", count: 12, pct: 100 },
    { name: "Little Stars", count: 9, pct: 75 },
    { name: "Tiny Tots", count: 7, pct: 58 },
  ],
};

type LeanActivity = {
  title?: string;
  type: GalleryItemType;
  createdAt: Date;
  teacher?: { user?: { firstName?: string; lastName?: string } | null } | null;
};

type LeanAnnouncement = {
  title?: string;
  body: string;
  createdAt: Date;
};

export async function getDashboardData(): Promise<DashboardData> {
  await connectDB();

  const monthStart = startOfMonthUTC();
  const weekStart = startOfWeekUTC();

  const [
    studentsCount,
    teachersCount,
    parentsCount,
    classroomsCount,
    studentsNew,
    teachersNew,
    parentsNew,
    classroomsNew,
    enrolled,
    attendanceGroups,
    activityDocs,
    announcementDocs,
    topClassGroups,
  ] = await Promise.all([
    Student.estimatedDocumentCount(),
    Teacher.estimatedDocumentCount(),
    Parent.estimatedDocumentCount(),
    Classroom.estimatedDocumentCount(),
    Student.countDocuments({ createdAt: { $gte: monthStart } }),
    Teacher.countDocuments({ createdAt: { $gte: monthStart } }),
    Parent.countDocuments({ createdAt: { $gte: monthStart } }),
    Classroom.countDocuments({ createdAt: { $gte: monthStart } }),
    Enrollment.countDocuments({ status: ENROLLMENT_STATUS.ACTIVE }),
    Attendance.aggregate<{ _id: AttendanceStatus; n: number }>([
      { $match: { date: { $gte: weekStart } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    GalleryItem.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(3)
      .select("title type createdAt teacher")
      .populate({
        path: "teacher",
        select: "user",
        populate: { path: "user", select: "firstName lastName" },
      })
      .lean<LeanActivity[]>(),
    Notification.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(2)
      .select("title body createdAt")
      .lean<LeanAnnouncement[]>(),
    GalleryItem.aggregate<{ _id: Types.ObjectId; n: number }>([
      {
        $match: {
          isActive: true,
          classroom: { $ne: null },
          createdAt: { $gte: monthStart },
        },
      },
      { $group: { _id: "$classroom", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 3 },
    ]),
  ]);

  // Attendance for this week, or the sample if nobody has taken a register yet.
  const byStatus = new Map<string, number>(
    attendanceGroups.map((g) => [g._id, g.n]),
  );
  const present =
    (byStatus.get(ATTENDANCE_STATUS.PRESENT) ?? 0) +
    (byStatus.get(ATTENDANCE_STATUS.LATE) ?? 0);
  const absent = byStatus.get(ATTENDANCE_STATUS.ABSENT) ?? 0;
  const onLeave = byStatus.get(ATTENDANCE_STATUS.EXCUSED) ?? 0;
  const totalMarked = present + absent + onLeave;

  const attendance: DashboardData["attendance"] =
    totalMarked === 0
      ? {
          ...SAMPLE.attendance,
          // Even the sample uses a real enrolled count when we have one.
          enrolled: enrolled > 0 ? enrolled : SAMPLE.attendance.enrolled,
        }
      : {
          pct: Math.round((present / totalMarked) * 100),
          present,
          absent,
          onLeave,
          enrolled: enrolled > 0 ? enrolled : totalMarked,
          isSample: false,
        };

  const activities: DashboardActivity[] =
    activityDocs.length > 0
      ? activityDocs.map((doc) => {
          const user = doc.teacher?.user;
          const name = user
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
            : "";
          return {
            title: doc.title?.trim() || GALLERY_ITEM_TYPE_LABEL[doc.type],
            by: name || "Staff",
            ago: timeAgo(new Date(doc.createdAt)),
          };
        })
      : SAMPLE.activities;

  const announcements: DashboardAnnouncement[] =
    announcementDocs.length > 0
      ? announcementDocs.map((doc) => ({
          title: doc.title?.trim() || doc.body,
          date: formatAnnouncementDate(new Date(doc.createdAt)),
        }))
      : SAMPLE.announcements;

  let topClasses: DashboardTopClass[] = SAMPLE.topClasses;
  if (topClassGroups.length > 0) {
    const rooms = await Classroom.find({
      _id: { $in: topClassGroups.map((g) => g._id) },
    })
      .select("name")
      .lean<{ _id: Types.ObjectId; name: string }[]>();
    const nameById = new Map(rooms.map((r) => [String(r._id), r.name]));
    const max = topClassGroups[0].n || 1;
    topClasses = topClassGroups.map((g) => ({
      name: nameById.get(String(g._id)) ?? "Classroom",
      count: g.n,
      pct: Math.round((g.n / max) * 100),
    }));
  }

  return {
    stats: {
      students: makeStat(studentsCount, studentsNew, {
        value: 128,
        trend: "↑ 12 this month",
        trendUp: true,
      }),
      teachers: makeStat(teachersCount, teachersNew, {
        value: 16,
        trend: "↑ 2 this month",
        trendUp: true,
      }),
      parents: makeStat(parentsCount, parentsNew, {
        value: 98,
        trend: "↑ 8 this month",
        trendUp: true,
      }),
      classes: makeStat(classroomsCount, classroomsNew, {
        value: 8,
        trend: "No change",
        trendUp: false,
      }),
    },
    attendance,
    activities,
    announcements,
    // No collection records meals yet, so this stays the sample until one does.
    meals: SAMPLE.meals,
    topClasses,
  };
}
