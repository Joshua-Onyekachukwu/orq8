"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Activity,
  BadgeCheck,
  Banknote,
  Boxes,
  Brain,
  Building2,
  CalendarClock,
  ChevronDown,
  Code2,
  Command,
  Compass,
  DollarSign,
  FileText,
  Gauge,
  Gavel,
  GitBranch,
  Globe,
  GraduationCap,
  HeartPulse,
  History,
  Inbox,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Network,
  Newspaper,
  Plug,
  Scale,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet,
  CreditCard,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "./branding/logo-mark";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/** A named group of destinations inside one primary area. */
type NavSubGroup = {
  title: string;
  items: NavItem[];
};

/**
 * Primary area of the company operating system (docs/61 Phase 2, and the
 * navigation direction: Company, Work, Organization, Decisions, Resources,
 * Governance).
 */
type NavArea = {
  title: string;
  items: NavItem[];
  subgroups?: NavSubGroup[];
};

// Every destination here is a page that exists. Where the direction names a
// destination that has no page yet (All Work, Tasks, Workstreams, Reviews,
// Authority & Permissions, Department Reports) it is deliberately absent
// rather than rendered as a placeholder.
const navAreas: NavArea[] = [
  {
    title: "Company",
    items: [
      { label: "Overview", href: "/app", icon: LayoutDashboard },
      // Temporary while the Company Hub is under review: it becomes Overview and
      // replaces /app once the founder approves the design (docs/63).
      { label: "Company Hub", href: "/app/company/overview", icon: Network },
      { label: "Health", href: "/app/health", icon: HeartPulse },
      { label: "Activity", href: "/app/activity", icon: Activity },
    ],
    subgroups: [
      {
        title: "Strategy",
        items: [
          { label: "Company Strategy", href: "/app/strategy", icon: Compass },
          { label: "Goals & Tasks", href: "/app/goals", icon: Target },
          { label: "Strategic Lineage", href: "/app/lineage", icon: GitBranch },
          { label: "Simulation", href: "/app/simulation", icon: Zap },
        ],
      },
      {
        title: "Reports",
        items: [
          { label: "Weekly Report", href: "/app/report", icon: ScrollText },
          { label: "Performance", href: "/app/performance", icon: TrendingUp },
          { label: "AI Workforce ROI", href: "/app/roi", icon: DollarSign },
          { label: "Briefings", href: "/app/briefings", icon: Newspaper },
        ],
      },
    ],
  },
  {
    title: "Work",
    items: [
      { label: "Tasks", href: "/app/tasks", icon: ListChecks },
      { label: "My Attention", href: "/app/attention", icon: Inbox },
      { label: "Scheduled Work", href: "/app/jobs", icon: CalendarClock },
      { label: "Engineering", href: "/app/engineering", icon: Code2 },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "AI Employees", href: "/app/agents", icon: Users },
      { label: "Departments", href: "/app/departments", icon: Building2 },
      { label: "Teams", href: "/app/teams", icon: Network },
      { label: "Squads", href: "/app/squads", icon: Layers },
      { label: "Org Explorer", href: "/app/org", icon: Boxes },
      { label: "Business Import", href: "/app/business-import", icon: Globe },
      { label: "Members", href: "/app/members", icon: User },
    ],
  },
  {
    title: "Decisions",
    items: [
      { label: "Decision Center", href: "/app/decisions", icon: Scale },
      { label: "Decision Council", href: "/app/council", icon: Gavel },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Files", href: "/app/files", icon: FileText },
      { label: "Knowledge", href: "/app/knowledge", icon: Brain },
      { label: "Company Memory", href: "/app/memory", icon: History },
      { label: "Integrations", href: "/app/integrations", icon: Plug },
      { label: "Tools & MCP", href: "/app/mcp", icon: Wrench },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Approvals", href: "/app/approvals", icon: ShieldCheck },
      { label: "Budgets", href: "/app/budgets", icon: Wallet },
      { label: "Finance", href: "/app/finance", icon: Banknote },
      { label: "Usage & Credits", href: "/app/usage", icon: Gauge },
      { label: "Buy Credits", href: "/app/credits", icon: CreditCard },
      { label: "Audit Trail", href: "/app/audit", icon: Shield },
      { label: "Constitution", href: "/app/constitution", icon: Landmark },
    ],
    subgroups: [
      {
        title: "Quality & Learning",
        items: [
          { label: "Quality", href: "/app/quality", icon: BadgeCheck },
          { label: "Learning", href: "/app/learning", icon: GraduationCap },
        ],
      },
    ],
  },
];

/** The area that owns a path, so the sidebar can open where the founder is. */
function areaForPath(pathname: string): string | null {
  for (const area of navAreas) {
    const hrefs = [
      ...area.items.map((i) => i.href),
      ...(area.subgroups ?? []).flatMap((g) => g.items.map((i) => i.href)),
    ];
    if (
      hrefs.some(
        (href) =>
          pathname === href || (href !== "/app" && pathname.startsWith(`${href}/`)),
      )
    ) {
      return area.title;
    }
  }
  return null;
}

export function AppSidebar({
  orgName,
  plan,
  userName,
  userAvatarUrl,
  platformRole,
}: {
  orgName: string;
  plan: string;
  userName: string;
  userAvatarUrl?: string | null;
  platformRole?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Areas start collapsed, except the one the founder is standing in, so the
  // sidebar reads as six things rather than thirty.
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => {
    const active = areaForPath(pathname);
    return new Set(active ? [active] : ["Company"]);
  });
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Set<string>>(new Set());

  // Moving into a new area opens it, and never closes what the founder opened.
  useEffect(() => {
    const active = areaForPath(pathname);
    if (!active) return;
    setOpenAreas((prev) => (prev.has(active) ? prev : new Set([...prev, active])));
  }, [pathname]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close user menu on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Mobile menu toggle is rendered in the sticky TopBar (top of viewport,
  // reachable without scrolling). The sidebar listens for the toggle event.
  useEffect(() => {
    const onToggle = () => setMobileOpen((prev) => !prev);
    window.addEventListener("orq8:toggle-sidebar", onToggle);
    return () => window.removeEventListener("orq8:toggle-sidebar", onToggle);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/app" && pathname.startsWith(href));

  const toggleArea = (title: string) => {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const toggleSubgroup = (title: string) => {
    setCollapsedSubgroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-2sm font-medium transition-all duration-200 ${
            active
              ? "bg-warm/15 text-warm-ink border border-warm/20"
              : "text-muted hover:bg-canvas hover:text-ink border border-transparent"
          }`}
        >
          <Icon
            className={`h-4 w-4 shrink-0 ${active ? "text-warm-ink" : "text-muted"}`}
          />
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-elevated text-ink">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-hairline px-5">
        <Link href="/app" className="flex items-center gap-2.5 text-ink">
          <LogoMark className="h-8 w-auto" wordmarkColor="currentColor" dotColor="var(--orq-brand-deep)" ariaLabel={`${orgName} home`} />
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-muted hover:text-ink hover:bg-canvas lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Plan badge */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-canvas border border-hairline px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-warm" />
          <span className="text-overline font-medium text-muted uppercase tracking-wider">{plan} plan</span>
        </div>
      </div>

      {/* Navigation — six primary areas */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navAreas.map((area) => {
          const isOpen = openAreas.has(area.title);
          const areaActive = areaForPath(pathname) === area.title;
          const itemCount =
            area.items.length +
            (area.subgroups ?? []).reduce((n, g) => n + g.items.length, 0);
          return (
            <div key={area.title} className="mb-1">
              <button
                onClick={() => toggleArea(area.title)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-canvas"
              aria-expanded={isOpen}
            >
              <span
                className={`text-3xs font-semibold uppercase tracking-[0.15em] ${
                  areaActive ? "text-warm-ink" : "text-muted"
                }`}
              >
                {area.title}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-3xs text-muted/60">{itemCount}</span>
                <ChevronDown
                  className={`h-3 w-3 text-muted/60 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                />
                </span>
              </button>

              {isOpen && (
                <div className="mt-0.5">
                  <ul className="space-y-0.5">{area.items.map(renderItem)}</ul>

                  {(area.subgroups ?? []).map((group) => {
                    const groupOpen = !collapsedSubgroups.has(group.title);
                    const groupActive = group.items.some((i) => isActive(i.href));
                    return (
                      <div key={group.title} className="mt-1">
                        <button
                          onClick={() => toggleSubgroup(group.title)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-canvas"
                          aria-expanded={groupOpen}
                        >
                          <span
                            className={`text-2sm font-medium ${
                              groupActive ? "text-ink" : "text-muted"
                            }`}
                          >
                            {group.title}
                          </span>
                          <ChevronDown
                            className={`h-3 w-3 text-muted/60 transition-transform ${groupOpen ? "" : "-rotate-90"}`}
                          />
                        </button>
                        {groupOpen && (
                          <ul className="mt-0.5 space-y-0.5 pl-2">{group.items.map(renderItem)}</ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-hairline p-3">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-2sm font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-warm/15 text-warm-ink"
              : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          <Settings className={`h-4 w-4 shrink-0 ${pathname.startsWith("/settings") ? "text-warm-ink" : "text-muted"}`} />
          Settings
        </Link>
        <Link
          href="/settings/providers"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-2sm font-medium transition-colors ${
            pathname.startsWith("/settings/providers")
              ? "bg-warm/15 text-warm-ink"
              : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          <KeyRound className={`h-4 w-4 shrink-0 ${pathname.startsWith("/settings/providers") ? "text-warm-ink" : "text-muted"}`} />
          Provider Keys
        </Link>

        {/* User account menu */}
        <div className="relative mt-2" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-2sm text-muted transition-colors hover:bg-canvas hover:text-ink"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            aria-label="User account menu"
          >
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-brand-deep flex items-center justify-center text-overline font-bold text-white">
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                userName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-ink truncate">{userName}</p>
              <p className="text-3xs text-muted truncate">{orgName}</p>
            </div>
            <ChevronDown className={`h-3 w-3 shrink-0 text-muted transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-hairline bg-elevated py-2 shadow-2xl">
              <div className="border-b border-hairline px-4 py-3">
                <p className="text-xs font-medium text-ink truncate">{userName}</p>
                <p className="text-3xs text-muted truncate">{orgName}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/app/profile"
                  className="flex items-center gap-2 px-4 py-2 text-2sm text-muted hover:bg-canvas hover:text-ink"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-muted" /> Profile
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-4 py-2 text-2sm text-muted hover:bg-canvas hover:text-ink"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 text-muted" /> Settings
                </Link>
                {platformRole === "admin" && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-2 text-2sm text-warm-ink hover:bg-warm/5"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Command className="h-4 w-4" /> Admin Dashboard
                  </Link>
                )}
              </div>
              <div className="border-t border-hairline pt-1">
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-4 py-2 text-2sm text-muted hover:bg-canvas hover:text-ink"
                  >
                    <LogOut className="h-4 w-4 text-muted" /> Sign out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-hairline">
        {sidebarContent}
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72">
            {sidebarContent}
          </div>
        </div>
      )}

    </>
  );
}
