"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * The full ORQ8 feature surface, navigable from day one. Features land in
 * phases (docs/49); items not yet built show their phase chip. `built: true`
 * items are live surfaces. The sidebar always lists everything so the org
 * knows what the system will grow into.
 */
type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  phase?: string;
  built?: boolean;
};

type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Command",
    items: [
      { label: "Dashboard", href: "/app", icon: LayoutDashboard, built: true },
      { label: "Decision Center", href: "/app/approvals", icon: ShieldCheck, phase: "Phase 3–5" },
      { label: "Weekly Report", href: "/app/report", icon: CalendarDays, phase: "Phase 3" },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "Org Explorer", href: "/app/org", icon: Building2, phase: "Phase 2" },
      { label: "Agents", href: "/app/agents", icon: Users, built: true },
      { label: "Departments & Teams", href: "/app/teams", icon: GitBranch, phase: "Phase 2" },
      { label: "Goals & Tasks", href: "/app/goals", icon: Target, phase: "Phase 4" },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Company Constitution", href: "/app/constitution", icon: ScrollText, phase: "Phase 5" },
      { label: "Budgets & Limits", href: "/app/budgets", icon: Wallet, phase: "Phase 2" },
      { label: "Audit Trail", href: "/app/audit", icon: ShieldCheck, phase: "Phase 5" },
      { label: "Agent Activity", href: "/app/activity", icon: Activity, built: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Providers & Keys", href: "/settings/providers", icon: KeyRound, built: true },
      { label: "Members & Roles", href: "/app/members", icon: Users, phase: "Phase 2" },
    ],
  },
];

export function AppSidebar({
  orgName,
  plan,
  userName,
  sampleMode,
}: {
  orgName: string;
  plan: string;
  userName: string;
  sampleMode: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/app" && pathname.startsWith(href));

  const NavList = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {group.title}
          </p>
          <ul className="mt-2 space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-white/10 font-medium text-lime"
                        : "text-white/65 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-lime" : "text-white/40 group-hover:text-white/70"}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.built ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" title="Live surface" />
                    ) : item.phase ? (
                      <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-white/40">
                        {item.phase}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const Wordmark = (
    <Link href="/app" className="flex items-baseline gap-1.5 text-xl font-bold tracking-tight text-white">
      ORQ8
      <span className="h-2 w-2 rounded-full bg-lime" aria-hidden />
    </Link>
  );

  const OrgBlock = (
    <div className="border-b border-white/10 px-5 py-4">
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
        {sampleMode ? "Sample org" : "Active org"}
      </p>
      <p className="mt-1.5 truncate text-sm font-medium text-white">{orgName}</p>
      <span className="mt-1 inline-block rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white/50">
        {plan}
      </span>
    </div>
  );

  const FooterBlock = (
    <div className="border-t border-white/10 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime font-bold text-navy-950">
          {userName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-wide text-white/40">CEO</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-white px-4 lg:hidden">
        {Wordmark}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg border border-hairline p-2 text-ink transition-colors hover:bg-canvas"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-navy-950/60 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-950 shadow-2xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-4">
            {Wordmark}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {OrgBlock}
          {NavList}
          {FooterBlock}
        </aside>
      </div>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-navy-950 lg:flex">
        <div className="px-5 py-6">
          {Wordmark}
        </div>
        {OrgBlock}
        {NavList}
        {FooterBlock}
      </aside>
    </>
  );
}
