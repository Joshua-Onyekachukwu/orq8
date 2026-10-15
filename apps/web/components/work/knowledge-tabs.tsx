"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One Knowledge concept, three lenses (AUD-007).
 *
 * Files, Knowledge Graph and Company Memory used to be three competing
 * sidebar entries — now one tab bar shared by all three routes, so the
 * founder sees everything the company knows in one place. The unified
 * search on the Knowledge lens queries all three stores. Routes stay live
 * (deep links, audit scripts).
 */
const TABS = [
  {
    href: "/app/knowledge",
    label: "Knowledge",
    hint: "Search everything",
  },
  {
    href: "/app/files",
    label: "Files",
    hint: "Uploads + docs",
  },
  {
    href: "/app/memory",
    label: "Memory",
    hint: "Remembered facts",
  },
] as const;

export function KnowledgeTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Knowledge views" className="mb-4">
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
