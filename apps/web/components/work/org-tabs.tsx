"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One grouping concept, three lenses (AUD-005).
 *
 * Teams are standing groups inside departments; squads are temporary mission
 * groups tied to work; the explorer is the everyone-tree. They used to be
 * three competing sidebar entries — now one tab bar shared by all three
 * routes, so the founder always sees where they are and what the other
 * lens is for. Routes stay live (audit scripts address them directly).
 */
const TABS = [
  {
    href: "/app/teams",
    label: "Teams",
    hint: "Standing groups",
  },
  {
    href: "/app/squads",
    label: "Mission squads",
    hint: "Temporary work groups",
  },
  {
    href: "/app/org",
    label: "Organization",
    hint: "Everyone tree",
  },
] as const;

export function OrgTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Grouping views" className="mb-4">
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
