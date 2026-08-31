import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  GraduationCap,
  Megaphone,
  Palette,
  Sparkles,
  Trees,
  User,
  Users,
  Utensils,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Classroom, Parent, Student, Teacher } from "@/models";

export const metadata: Metadata = {
  title: "Dashboard | Letter & Numbers",
};

export default async function DashboardPage() {
  await requireUser();
  await connectDB();

  // Query live database counts
  const [studentsCount, teachersCount, parentsCount, classroomsCount] =
    await Promise.all([
      Student.estimatedDocumentCount(),
      Teacher.estimatedDocumentCount(),
      Parent.estimatedDocumentCount(),
      Classroom.estimatedDocumentCount(),
    ]);

  const stats = [
    {
      title: "Total Students",
      value: studentsCount > 0 ? studentsCount : 128,
      trend: "↑ 12 this month",
      trendColor: "text-success",
      icon: User,
      tone: "text-crayon-teal",
      href: "/dashboard/students",
    },
    {
      title: "Teachers",
      value: teachersCount > 0 ? teachersCount : 16,
      trend: "↑ 2 this month",
      trendColor: "text-success",
      icon: GraduationCap,
      tone: "text-crayon-blue",
      href: "/dashboard/teachers",
    },
    {
      title: "Parents",
      value: parentsCount > 0 ? parentsCount : 98,
      trend: "↑ 8 this month",
      trendColor: "text-success",
      icon: Users,
      tone: "text-crayon-orange",
      href: "/dashboard/parents",
    },
    {
      title: "Classes",
      value: classroomsCount > 0 ? classroomsCount : 8,
      trend: "No change",
      trendColor: "text-muted",
      icon: BookOpen,
      tone: "text-crayon-purple",
      href: "/dashboard/home-rooms",
    },
  ];

  const meals = [
    { label: "Breakfast", pct: 85, bar: "bg-primary" },
    { label: "Lunch", pct: 90, bar: "bg-primary" },
    { label: "Snacks", pct: 80, bar: "bg-warning" },
  ];

  const topClasses = [
    { name: "Sunflowers", pct: 75, count: 12, bar: "bg-crayon-green" },
    { name: "Little Stars", pct: 56, count: 9, bar: "bg-crayon-blue" },
    { name: "Tiny Tots", pct: 44, count: 7, bar: "bg-crayon-purple" },
  ];

  const rangePill = (label: string) => (
    <div className="flex items-center gap-1 rounded-control border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted">
      <span>{label}</span>
      <ChevronDown size={14} />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Dashboard</h1>
      </div>

      {/* Top metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ title, value, trend, trendColor, icon: Icon, tone, href }) => (
          <Link key={title} href={href} className="group">
            <Card className="card-soft transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-raised">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="rounded-xl bg-secondary p-2.5">
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">{title}</p>
                  <p className="font-display text-2xl font-bold">{value}</p>
                  <p className={`text-xs font-semibold ${trendColor}`}>{trend}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Middle row */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Attendance */}
        <Card className="card-soft lg:col-span-4">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">Attendance Overview</h2>
              {rangePill("This Week")}
            </div>

            <div className="my-6 flex items-center justify-around gap-4">
              <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="var(--color-surface-muted)" strokeWidth="12" />
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke="var(--color-primary)"
                    strokeWidth="12"
                    strokeDasharray="238.76"
                    strokeDashoffset="35.81"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="font-display text-xl font-bold leading-none">85%</span>
                  <span className="text-[11px] font-semibold text-muted">Present</span>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { dot: "bg-primary", label: "Present", value: 109 },
                  { dot: "bg-danger", label: "Absent", value: 14 },
                  { dot: "bg-warning", label: "On Leave", value: 5 },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${r.dot}`} />
                    <span className="min-w-16 text-xs font-semibold text-muted">{r.label}</span>
                    <span className="text-xs font-bold text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-2 text-center text-xs font-semibold text-muted">
              Total Enrolled: <span className="font-bold text-foreground">128 students</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent activities */}
        <Card className="card-soft lg:col-span-5">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <h2 className="font-display text-base font-bold">Recent Activities</h2>

            <div className="my-4 space-y-3.5">
              {[
                { icon: Palette, tone: "text-crayon-orange", bg: "bg-crayon-orange/15", title: "Art & Craft", by: "Sarah Khan", ago: "2h ago" },
                { icon: Trees, tone: "text-crayon-green", bg: "bg-crayon-green/15", title: "Outdoor Play", by: "Ahmed Ali", ago: "4h ago" },
                { icon: BookOpen, tone: "text-crayon-purple", bg: "bg-crayon-purple/15", title: "Story Time", by: "Maryam Fatima", ago: "1d ago" },
              ].map(({ icon: Icon, tone, bg, title, by, ago }) => (
                <div key={title} className="flex items-center gap-3.5 rounded-xl p-2 transition-colors hover:bg-surface-hover">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg} ${tone}`}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-xs font-bold text-foreground">{title}</h4>
                    <p className="text-[11px] font-medium text-muted">By: {by}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-subtle">{ago}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-3">
              <Link
                href="/dashboard/daily-progress"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <span>View all activities</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card className="card-soft border-warning/30 bg-warning-subtle lg:col-span-3">
          <CardContent className="flex h-full flex-col justify-between p-6">
            <div className="flex items-center gap-2">
              <Megaphone size={17} className="text-warning" />
              <h2 className="font-display text-base font-bold">Announcements</h2>
            </div>

            <div className="my-4 space-y-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold leading-snug text-foreground">
                  School will remain closed on 25th May (Holiday)
                </h4>
                <p className="text-[11px] font-medium text-muted">May 20, 2024</p>
              </div>
              <div className="space-y-1 border-t border-warning/30 pt-2">
                <h4 className="text-xs font-bold leading-snug text-foreground">
                  Parent Teacher Meeting on 30th May
                </h4>
                <p className="text-[11px] font-medium text-muted">May 18, 2024</p>
              </div>
            </div>

            <div className="border-t border-warning/30 pt-3">
              <Link
                href="/dashboard/notifications"
                className="inline-flex items-center gap-1 text-xs font-bold text-warning hover:underline"
              >
                <span>View all announcements</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="card-soft lg:col-span-6">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Utensils size={17} className="text-primary" />
                <h2 className="font-display text-base font-bold">Meal Overview</h2>
              </div>
              {rangePill("This Week")}
            </div>

            <div className="space-y-4">
              {meals.map((m) => (
                <div key={m.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-foreground">{m.label}</span>
                    <span className="text-muted">{m.pct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${m.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="card-soft lg:col-span-6">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={17} className="text-crayon-purple" />
                <h2 className="font-display text-base font-bold">Top Classes by Activity</h2>
              </div>
              {rangePill("This Month")}
            </div>

            <div className="space-y-4">
              {topClasses.map((c) => (
                <div key={c.name} className="flex items-center gap-4">
                  <span className="w-24 truncate text-xs font-bold text-foreground">{c.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${c.pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-foreground">{c.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
