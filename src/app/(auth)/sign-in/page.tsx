import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/BrandMark";
import { getSession } from "@/lib/session";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in | Letters and Numbers",
};

/**
 * `next` carries where the user was headed before the proxy bounced them here.
 * Only same-site paths are honoured - taking an absolute URL from the query
 * string would turn this page into an open redirect.
 */
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

  // Already signed in - no reason to show the form again.
  if (await getSession()) redirect(redirectTo);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <Decoration />

      <div className="relative w-full max-w-[400px] rounded-card border border-border bg-surface p-8 shadow-overlay">
        <BrandMark className="mx-auto h-32 w-32" />

        <h1 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
          Welcome to LettersAndNumbers!{" "}
          <span aria-hidden="true">&#128075;</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          Please sign-in to your account
        </p>

        <SignInForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}

/**
 * The offset panels behind the card. Purely ornamental, so it is hidden from
 * assistive tech and dropped entirely on small screens where it would only
 * crowd the form.
 */
function Decoration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden sm:block"
    >
      <div className="absolute left-1/2 top-1/2 h-[420px] w-[520px] -translate-x-[62%] -translate-y-[58%] rounded-card bg-surface-muted/70" />
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-[78%] -translate-y-[92%] rounded-card border border-border/60" />
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-[6%] -translate-y-[10%] rounded-card border border-dashed border-border-strong/70" />
      <div className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-[14%] -translate-y-[2%] rounded-card bg-surface-muted/70" />
    </div>
  );
}
