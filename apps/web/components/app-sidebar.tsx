"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Activity,
  BadgeCheck,
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
      { label: "Overview (new hub)", href: "/app/company/overview", icon: LayoutDashboard },
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
      { label: "Usage & Credits", href: "/app/usage", icon: Gauge },
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
              ? "bg-orq8-orange-bright/15 text-orq8-orange-bright border border-orq8-orange/20"
              : "text-white/50 hover:bg-white/[0.04] hover:text-white/80 border border-transparent"
          }`}
        >
          <Icon
            className={`h-4 w-4 shrink-0 ${active ? "text-orq8-orange-bright" : "text-white/30"}`}
          />
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
      </li>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-orq8-dark">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-5">
        <Link href="/app" className="flex items-center gap-2.5 text-white">
          <LogoMark className="h-8 w-auto" wordmarkColor="currentColor" dotColor="#B8FF66" ariaLabel={`${orgName} home`} />
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/5 lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Plan badge */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-orq8-orange-bright" />
          <span className="text-overline font-medium text-white/60 uppercase tracking-wider">{plan} plan</span>
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
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]"
                aria-expanded={isOpen}
              >
                <span
                  className={`text-3xs font-semibold uppercase tracking-[0.15em] ${
                    areaActive ? "text-orq8-orange-bright" : "text-white/40"
                  }`}
                >
                  {area.title}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-3xs text-white/25">{itemCount}</span>
                  <ChevronDown
                    className={`h-3 w-3 text-white/25 transition-transform ${isOpen ? "" : "-rotate-90"}`}
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
                          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-white/[0.03]"
                          aria-expanded={groupOpen}
                        >
                          <span
                            className={`text-2sm font-medium ${
                              groupActive ? "text-white/75" : "text-white/40"
                            }`}
                          >
                            {group.title}
                          </span>
                          <ChevronDown
                            className={`h-3 w-3 text-white/25 transition-transform ${groupOpen ? "" : "-rotate-90"}`}
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
      <div className="border-t border-white/[0.06] p-3">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-2sm font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-orq8-orange-bright/15 text-orq8-orange-bright"
              : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
          }`}
        >
          <Settings className={`h-4 w-4 shrink-0 ${pathname.startsWith("/settings") ? "text-orq8-orange-bright" : "text-white/30"}`} />
          Settings
        </Link>
        <Link
          href="/settings/providers"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-2sm font-medium transition-colors ${
            pathname.startsWith("/settings/providers")
              ? "bg-orq8-orange-bright/15 text-orq8-orange-bright"
              : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
          }`}
        >
          <KeyRound className={`h-4 w-4 shrink-0 ${pathname.startsWith("/settings/providers") ? "text-orq8-orange-bright" : "text-white/30"}`} />
          Provider Keys
        </Link>

        {/* User account menu */}
        <div className="relative mt-2" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-2sm text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/80"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            aria-label="User account menu"
          >
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-orq8-green flex items-center justify-center text-overline font-bold text-white">
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
              <p className="text-xs font-medium text-white/70 truncate">{userName}</p>
              <p className="text-3xs text-white/30 truncate">{orgName}</p>
            </div>
            <ChevronDown className={`h-3 w-3 shrink-0 text-white/30 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-white/10 bg-orq8-dark/95 backdrop-blur-xl py-2 shadow-2xl">
              <div className="border-b border-white/[0.06] px-4 py-3">
                <p className="text-xs font-medium text-white/80 truncate">{userName}</p>
                <p className="text-3xs text-white/40 truncate">{orgName}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/app/profile"
                  className="flex items-center gap-2 px-4 py-2 text-2sm text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-white/40" /> Profile
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-4 py-2 text-2sm text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 text-white/40" /> Settings
                </Link>
                {platformRole === "admin" && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-2 text-2sm text-orq8-orange hover:bg-orq8-orange/5"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Command className="h-4 w-4" /> Admin Dashboard
                  </Link>
                )}
              </div>
              <div className="border-t border-white/[0.06] pt-1">
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-4 py-2 text-2sm text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                  >
                    <LogOut className="h-4 w-4 text-white/40" /> Sign out
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
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-white/[0.06]">
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
