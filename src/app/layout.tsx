import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";

import { QueryProvider } from "@/components/QueryProvider";

const baloo2 = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Letters and Numbers | Dashboard",
  description: "Admin dashboard for Letters and Numbers.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${baloo2.variable} ${nunito.variable} h-full antialiased`}
    >
      {/* The provider takes `children` as a slot, so everything inside it -
          every page, every layout - stays a server component. */}
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
