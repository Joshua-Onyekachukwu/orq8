import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ORQ8 — The AI Organization Operating System",
    template: "%s · ORQ8",
  },
  description:
    "Tell ORQ8 what you want. It hires the team, does the work, and reports back. The AI Organization Operating System for one-person companies.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
