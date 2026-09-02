"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  ChevronDown,
  FileText,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Target,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
      { label: "Command Center", href: "/app/approvals", icon: ShieldCheck, badge: "Approvals" },
      { label: "Weekly Report", href: "/app/report", icon: ScrollText },
    ],
  },
  {
    title: "Organization",
    items: [
      { label: "AI Employees", href: "/app/agents", icon: Users },
      { label: "Goals & Tasks", href: "/app/goals", icon: Target },
      { label: "Departments", href: "/app/teams", icon: GitBranch },
      { label: "Org Explorer", href: "/app/org", icon: Building2 },
    ],
  },
  {
    title: "Governance",
    items: [
      { label: "Notifications", href: "/app/notifications", icon: Bell },
      { label: "Company Memory", href: "/app/memory", icon: ScrollText },
      { label: "Audit Trail", href: "/app/audit", icon: Shield },
      { label: "Budgets", href: "/app/budgets", icon: Wallet },
      { label: "Files", href: "/app/files", icon: FileText },
      { label: "Constitution", href: "/app/constitution", icon: ScrollText },
    ],
  },
];

export function AppSidebar({
  orgName,
  plan,
  userName,
}: {
  orgName: string;
  plan: string;
  userName: string;
  sampleMode: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
    <div className="flex h-full flex-col bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-hairline px-5">
        <Link href="/app" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900">
            <Zap className="h-4 w-4 text-lime" />
          </div>
          <span className="text-lg font-bold tracking-tight text-navy-900">
            ORQ8
          </span>
        </Link>
        {/* Mobile close */}
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-muted hover:bg-canvas lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted/60">
                  {group.title}
                </span>
                <ChevronDown
                  className={`h-3 w-3 text-muted/40 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
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
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                            active
                              ? "bg-navy-900 text-white"
                              : "text-muted hover:bg-canvas hover:text-ink"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              active ? "text-lime" : "text-muted/50"
                            }`}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && !active && (
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
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
      <div className="border-t border-hairline p-3">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-navy-900 text-white"
              : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          <Settings
            className={`h-4 w-4 shrink-0 ${
              pathname.startsWith("/settings") ? "text-lime" : "text-muted/50"
            }`}
          />
          Settings
        </Link>
        <Link
          href="/settings/providers"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
            pathname.startsWith("/settings/providers")
              ? "bg-navy-900 text-white"
              : "text-muted hover:bg-canvas hover:text-ink"
          }`}
        >
          <KeyRound
            className={`h-4 w-4 shrink-0 ${
              pathname.startsWith("/settings/providers")
                ? "text-lime"
                : "text-muted/50"
            }`}
          />
          Provider Keys
        </Link>
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
          <div
            className="fixed inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-navy-900 text-white shadow-lg lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
}
