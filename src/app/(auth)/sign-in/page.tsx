import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpen, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { getSession } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in | Letters and Numbers",
};

function safeRedirect(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const redirectTo = safeRedirect(typeof next === "string" ? next : undefined);

  if (await getSession()) redirect(redirectTo);

  return (
    <main className="min-h-dvh w-full bg-background flex flex-col lg:flex-row overflow-hidden">
      {/* Left Brand Showcase Panel */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-border bg-sidebar overflow-hidden">
        {/* Subtle Brand Color Accent Blobs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-crayon-red/10 blur-3xl" />

        {/* Top Header Tag */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs">
            <Sparkles size={14} className="text-crayon-orange" />
            <span>Letters and Numbers</span>
          </span>
        </div>

        {/* Center Hero Brand Display */}
        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <div className="inline-block p-4 rounded-3xl bg-surface border border-border/80 shadow-raised transition-transform hover:scale-105 duration-300">
            <BrandMark className="h-44 w-44" />
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground leading-tight">
              Empowering Early Education &amp; Student Learning
            </h1>
            <p className="text-sm font-medium text-muted leading-relaxed">
              Track student daily progress, record attendance, manage parent communications, and monitor academic growth in one seamless dashboard portal.
            </p>
          </div>

          {/* Feature Pill Badges */}
          <div className="flex flex-wrap gap-2.5 pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-success/30 bg-success-subtle px-3 py-1.5 text-xs font-bold text-success">
              <GraduationCap size={14} /> Student Progress
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-bold text-cyan-800">
              <BookOpen size={14} /> Daily Sheets
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 bg-danger-subtle px-3 py-1.5 text-xs font-bold text-danger">
              <ShieldCheck size={14} /> Parent Portal
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs font-semibold text-muted">
          &copy; {new Date().getFullYear()} Letters and Numbers &bull; All Rights Reserved
        </div>
      </div>

      {/* Right Sign In Form Panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 lg:w-1/2 bg-surface">
        <div className="mx-auto w-full max-w-md space-y-8">
          {/* Mobile Logo Display */}
          <div className="flex flex-col items-center text-center lg:hidden">
            <BrandMark className="h-24 w-24 mb-3" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Letters and Numbers
            </h2>
            <p className="text-xs text-muted mt-1">School Management Dashboard</p>
          </div>

          {/* Title Header */}
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Sign in to your account
            </h2>
            <p className="text-xs sm:text-sm font-medium text-muted">
              Enter your credentials to access the admin portal
            </p>
          </div>

          {/* Form */}
          <div className="rounded-2xl border border-border/80 bg-background/50 p-6 sm:p-8 shadow-card">
            <SignInForm redirectTo={redirectTo} />
          </div>
        </div>
      </div>
    </main>
  );
}
