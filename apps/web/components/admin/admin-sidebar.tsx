"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Bot,
  ShieldCheck,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "AI Agents", href: "/admin/agents", icon: Bot },
  { label: "Approval Queue", href: "/admin/approvals", icon: ShieldCheck, badge: 3 },
  { label: "Activity Log", href: "/admin/activity", icon: Activity },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(href));

  const NavList = (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active
                ? "bg-lime/10 font-medium text-lime"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${
                active ? "text-lime" : "text-white/40 group-hover:text-white/70"
              }`}
            />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-navy-950 px-4 lg:hidden">
        <Link href="/admin" className="flex items-baseline gap-1.5 text-xl font-bold tracking-tight text-white">
          ORQ8 <span className="h-2 w-2 rounded-full bg-lime" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          className="rounded-lg p-2 text-white/60 hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-navy-950/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-navy-950 shadow-2xl transition-transform ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <Link href="/admin" className="flex items-baseline gap-1.5 text-xl font-bold text-white">
              ORQ8 <span className="h-2 w-2 rounded-full bg-lime" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="rounded-lg p-2 text-white/60 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="border-b border-white/10 px-5 py-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime">
              Admin Panel
            </p>
          </div>
          {NavList}
          <div className="border-t border-white/10 px-5 py-4">
            <Link
              href="/app"
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
            >
              <LayoutDashboard className="h-4 w-4" />
              Back to App
            </Link>
          </div>
        </aside>
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-navy-950 lg:flex">
        <div className="px-5 py-6">
          <Link href="/admin" className="flex items-baseline gap-1.5 text-xl font-bold tracking-tight text-white">
            ORQ8 <span className="h-2 w-2 rounded-full bg-lime" />
          </Link>
        </div>
        <div className="border-b border-white/10 px-5 py-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime">
            Admin Panel
          </p>
        </div>
        {NavList}
        <div className="mt-auto border-t border-white/10 px-5 py-4 space-y-2">
          <Link
            href="/app"
            className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
          >
            <LayoutDashboard className="h-4 w-4" />
            Back to App
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
