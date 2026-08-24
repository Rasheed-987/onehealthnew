import { redirect } from "next/navigation";

/**
 * The app has no marketing page - `/` is just the way in. The dashboard layout
 * does the auth check and bounces anyone signed out to /sign-in.
 */
export default function Home() {
  redirect("/dashboard");
}
