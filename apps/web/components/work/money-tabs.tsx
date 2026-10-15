"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One Money concept, four lenses (AUD-006).
 *
 * Buy Credits, Usage, Budgets and Finance used to be four competing sidebar
 * entries — now one tab bar shared by all four routes, so the founder sees
 * balance, spend, limits and real-money figures as one place. The buy flow
 * is one click from any lens. Routes stay live (deep links, Stripe return
 * URLs with ?credits=purchased, audit scripts).
 */
const TABS = [
  {
    href: "/app/usage",
    label: "Usage",
    hint: "Balance + spend",
  },
  {
    href: "/app/credits",
    label: "Buy Credits",
    hint: "Packs + history",
  },
  {
    href: "/app/budgets",
    label: "Budgets",
    hint: "Caps by goal + team",
  },
  {
    href: "/app/finance",
    label: "Finance",
    hint: "Real money in",
  },
] as const;

export function MoneyTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Money views" className="mb-4">
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
