import "remixicon/fonts/remixicon.css";
import "swiper/css";
import "swiper/css/bundle";

// Globals
import "./globals.css";

import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Navbar from "@/components/Layout/Navbar";
import Footer from "@/components/Layout/Footer";
import GoTop from "@/components/Layout/GoTop";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ORQ8 — Run your company with AI employees",
  description:
    "You set the direction. ORQ8 hires the team, does the work, and reports back — under your approvals, your budgets, your audit trail.",
  other: {
    "theme-color": "#0d1427",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased !bg-white dark:!bg-dark`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1000] focus:bg-[#c8ff32] focus:text-[#0d1427] focus:px-4 focus:py-2 focus:rounded-md focus:font-medium"
        >
          Skip to content
        </a>
        <Navbar />

        <main id="main">{children}</main>

        <Footer />

        <GoTop />
      </body>
    </html>
  );
}
