"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One Reports concept, four lenses (AUD-010).
 *
 * Weekly Report, Performance, Workforce ROI and Briefings used to be four
 * competing sidebar entries — now one tab bar shared by all four routes.
 * The weekly report is the host lens (real rows, real week). Routes stay
 * live (deep links, audit scripts).
 */
const TABS = [
  {
    href: "/app/report",
    label: "Weekly",
    hint: "This week, real rows",
  },
  {
    href: "/app/performance",
    label: "Performance",
    hint: "Reliability profiles",
  },
  {
    href: "/app/roi",
    label: "Workforce ROI",
    hint: "Spend vs value",
  },
  {
    href: "/app/briefings",
    label: "Briefings",
    hint: "Digests + alerts",
  },
] as const;

export function ReportsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Report views" className="mb-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-canvas p-1">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center transition-colors ${
                active
                  ? "bg-elevated text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              <span className="block text-xs font-semibold">{tab.label}</span>
              <span className="block text-3xs text-muted">{tab.hint}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
