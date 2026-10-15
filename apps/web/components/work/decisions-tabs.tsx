"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One decision queue, two lenses (AUD-008).
 *
 * The Decision Center records decisions and tracks outcomes; the Council
 * deliberates significant questions before they become decisions. They used
 * to be two competing sidebar entries — now one tab bar shared by both
 * routes, so the founder sees the deliberation-to-decision path in one
 * place. Routes stay live (deep links, audit scripts, and the council's
 * session-detail view address them directly).
 */
const TABS = [
  {
    href: "/app/decisions",
    label: "Decision Center",
    hint: "Recorded decisions + outcomes",
  },
  {
    href: "/app/council",
    label: "Decision Council",
    hint: "Deliberations before deciding",
  },
] as const;

export function DecisionsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Decision views" className="mb-4">
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
