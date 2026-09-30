import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { AnalyticsProvider } from "@/components/analytics-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: {
    default: "ORQ8: The AI Organization Operating System",
    template: "%s · ORQ8",
  },
  description:
    "Tell ORQ8 what you want. It hires the team, does the work, and reports back. The AI Organization Operating System for one-person companies.",
  icons: {
    // The four-tile ORQ8 mark, generated from the same geometry the LogoMark
    // component draws. Vector first, then a raster fallback for older browsers.
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // The product is light-first, so the mobile browser chrome matches the page
  // (#FFFFFF, --orq-surface-page) rather than a dark band. The meta value is a
  // literal on purpose: the browser reads it before any CSS exists.
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable, jetbrains.variable)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-deep focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        {children}
        <AnalyticsProvider />
      </body>
    </html>
  );
}
