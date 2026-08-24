import type { Metadata } from "next";
import { GraduationCap, TrendingUp, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { connectDB } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Parent, Student, Teacher } from "@/models";

export const metadata: Metadata = {
  title: "Dashboard | Letters and Numbers",
};

export default async function DashboardPage() {
  const user = await requireUser();
  await connectDB();

  // Counted in parallel - three independent round trips have no reason to
  // queue behind each other.
  const [students, teachers, parents] = await Promise.all([
    Student.estimatedDocumentCount(),
    Teacher.estimatedDocumentCount(),
    Parent.estimatedDocumentCount(),
  ]);

  const stats = [
    {
      value: students,
      label: "Total Students",
      icon: TrendingUp,
      tint: "bg-primary-subtle text-primary",
    },
    {
      value: teachers,
      label: "Total Teachers",
      icon: GraduationCap,
      tint: "bg-primary-subtle text-primary",
    },
    {
      value: parents,
      label: "Total Parents",
      icon: Users,
      tint: "bg-danger-subtle text-danger",
    },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.firstName}`}
        description="Here is where the school stands today."
      />

      <section className="rounded-card border border-border bg-surface p-6 shadow-card">
        <h2 className="text-lg font-semibold text-foreground">Statistics</h2>

        <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(({ value, label, icon: Icon, tint }) => (
            <div key={label} className="flex items-center gap-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tint}`}
                aria-hidden="true"
              >
                <Icon size={22} />
              </span>
              <div>
                <dd className="text-2xl font-semibold leading-tight text-foreground">
                  {value}
                </dd>
                <dt className="text-sm text-muted">{label}</dt>
              </div>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
