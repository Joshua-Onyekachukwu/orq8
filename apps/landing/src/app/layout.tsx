import "remixicon/fonts/remixicon.css";
import "swiper/css";
import "swiper/css/bundle";

// Globals
import "./globals.css";

import type { Metadata } from "next";
import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import GoTop from "@/components/Layout/GoTop";

export const metadata: Metadata = {
  title: "ORQ8: Run your company with AI employees",
  description:
    "You set the direction. ORQ8 hires the team, does the work, and reports back under your approvals and your budget.",
  other: {
    "theme-color": "#0a0e19",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Light theme only for now. The dark: styles stay in the codebase for the
    // future dark-mode pass, but nothing applies the "dark" class anymore, so
    // the site always renders in the approved white/navy design.
    <html lang="en" className="overflow-x-hidden">
      <head />
      <body className="antialiased !bg-white dark:!bg-dark overflow-x-hidden">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000] focus:bg-lime focus:text-navy-950 focus:px-4 focus:py-2 focus:rounded-md focus:font-medium"
        >
          Skip to content
        </a>
        <Navbar />

        <main id="main" className="overflow-x-hidden">{children}</main>

        <Footer />

        <GoTop />
      </body>
    </html>
  );
}
