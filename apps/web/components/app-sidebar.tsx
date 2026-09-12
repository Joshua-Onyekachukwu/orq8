"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  Brain,
  CalendarClock,
  Building2,
  ChevronDown,
  Command,
  Compass,
  DollarSign,
  FileText,

  Globe,
  Newspaper,
  GraduationCap,
  Code2,
  GitBranch,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Scale,
  Settings,
  Plug,
  Shield,
  ShieldCheck,
  Target,
  User,
  Users,
  Wallet,
  X,
  Zap,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "./branding/logo-mark";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Command",
    items: [
      { label: "Dashboard", href: "/app", icon: LayoutDashboard },
      { label: "Company Health", href: "/app/health", icon: HeartPulse },
      { label: "Scheduled Jobs", href: "/app/jobs", icon: CalendarClock },
      { label: "Command Center", href: "/app/approvals", icon: ShieldCheck, badge: "Approvals" },
      { label: "Weekly Report", href: "/app/report", icon: ScrollText },
      { label: "Performance", href: "/app/performance", icon: Activity },
      { label: "Engineering", href: "/app/engineering", icon: Code2 },
      { label: "MCP & Tools", href: "/app/mcp", icon: Plug },
      { label: "Simulation", href: "/app/simulation", icon: Zap },
      { label: "Squads", href: "/app/squads", icon: Users },
      { label: "AI Workforce ROI", href: "/app/roi", icon: DollarSign },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "AI Employees", href: "/app/agents", icon: Users },
      { label: "Departments", href: "/app/departments", icon: Building2 },
      { label: "Teams", href: "/app/teams", icon: GitBranch },
      { label: "Strategy", href: "/app/strategy", icon: Compass },
      { label: "Goals & Tasks", href: "/app/goals", icon: Target },
      { label: "Org Explorer", href: "/app/org", icon: Building2 },
      { label: "Business Import", href: "/app/business-import", icon: Globe },
    ],
  },
  {
    title: "Systems",
    items: [{ label: "Integrations", href: "/app/integrations", icon: Plug }],
  },
  {
    title: "Governance",
    items: [
      { label: "Notifications", href: "/app/notifications", icon: Bell },
      { label: "Company Memory", href: "/app/memory", icon: ScrollText },
      { label: "Strategic Lineage", href: "/app/lineage", icon: GitBranch },
      { label: "Decision Memory", href: "/app/decisions", icon: BookOpen },
      { label: "Decision Council", href: "/app/council", icon: Scale },
      { label: "Knowledge Graph", href: "/app/knowledge", icon: Brain },
      { label: "Audit Trail", href: "/app/audit", icon: Shield },
      { label: "Budgets", href: "/app/budgets", icon: Wallet },
      { label: "Usage & Limits", href: "/app/usage", icon: Gauge },
      { label: "Files", href: "/app/files", icon: FileText },
      { label: "Constitution", href: "/app/constitution", icon: ScrollText },
      { label: "Quality & Learning", href: "/app/quality", icon: Shield },
      { label: "Learning", href: "/app/learning", icon: GraduationCap },
      { label: "Briefings", href: "/app/briefings", icon: Newspaper },
    ],
  },
];

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
  sampleMode: boolean;
  platformRole?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
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
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Plan badge */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-orq8-lime animate-pulse" />
          <span className="text-overline font-medium text-white/60 uppercase tracking-wider">{plan} plan</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.title);
          return (
            <div key={group.title} className="mb-4">
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between px-2 py-1"
              >
                <span className="text-3xs font-semibold uppercase tracking-[0.15em] text-white/30">
                  {group.title}
                </span>
                <ChevronDown
                  className={`h-3 w-3 text-white/20 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                />
              </button>
              {!isCollapsed && (
                <ul className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
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
                            className={`h-4 w-4 shrink-0 ${
                              active ? "text-orq8-orange-bright" : "text-white/30"
                            }`}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && !active && (
                            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-3xs font-medium text-white/40">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
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
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-orq8-green flex items-center justify-center text-overline font-bold text-orq8-lime">
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
