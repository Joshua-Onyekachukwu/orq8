"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageErrorBoundary } from "./page-error-boundary";

const tabs = [
  { label: "Account settings", href: "/settings" },
  { label: "Change password", href: "/settings/change-password" },
  { label: "Connections", href: "/settings/connections" },
  { label: "Privacy policy", href: "/settings/privacy-policy" },
  { label: "Terms & conditions", href: "/settings/terms-conditions" },
];

/**
 * Settings hub shell, adapted from the Trezo settings Nav: a top bar plus
 * pill tabs that highlight the active section. Standalone layout (the
 * dashboard shell has its own sidebar); Providers & Keys lives at
 * /settings/providers and is linked from Connections.
 */
export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return (
    <div id="main" className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="inline-flex items-baseline gap-1.5 text-lg font-bold tracking-tight text-orq8-dark"
          >
            ORQ8
            <span className="h-2 w-2 rounded-full bg-orq8-lime" aria-hidden />
          </Link>
          <Link
            href="/app"
            className="rounded-md border border-hairline px-3 py-1.5 text-sm text-muted transition-colors hover:border-orq8-green hover:text-orq8-green"
          >
            ← Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
          Settings
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>

        <nav aria-label="Settings sections" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const active = normalized === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-block rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-orq8-dark bg-orq8-dark text-white"
                        : "border-hairline bg-white text-orq8-green hover:border-orq8-green"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6">
          <PageErrorBoundary pageName="Settings" backHref="/app">
            {children}
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}
