"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  LogOut,
  Search,
  Settings,
  User,
  Building2,
  Command,
  HelpCircle,
  X,
} from "lucide-react";
import { NotificationsBell } from "./notifications-bell";

interface TopBarProps {
  userName: string;
  orgName: string;
  plan: string;
  userRole: string;
  /** Platform-level role ("admin" | "user") — gates the Admin Dashboard link. */
  platformRole?: string;
}

export function TopBar({ userName, orgName, plan, userRole, platformRole }: TopBarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Keyboard shortcut: Cmd/Ctrl+K to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const planLabel =
    plan === "trial"
      ? "Trial"
      : plan === "founder"
        ? "Founder"
        : plan === "team"
          ? "Team"
          : plan === "company"
            ? "Company"
            : plan;

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-hairline bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        {/* Left: Page context / breadcrumb area */}
        <div className="flex flex-1 items-center gap-3">
          {/* Mobile menu toggle — handled by sidebar */}
          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-navy-900"
            >
              ORQ8
              <span className="h-1.5 w-1.5 rounded-full bg-lime" />
            </Link>
          </div>

          {/* Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-4 hidden items-center gap-2 rounded-lg border border-hairline bg-canvas px-3 py-1.5 text-sm text-muted transition-colors hover:border-navy-200 hover:text-ink sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="ml-4 rounded border border-hairline bg-white px-1.5 py-0.5 font-mono text-[10px] text-muted">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Command Center quick access */}
          <Link
            href="/app"
            className="hidden items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-navy-200 hover:text-ink sm:flex"
          >
            <Command className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Command</span>
          </Link>

          {/* Notifications */}
          <NotificationsBell />

          {/* Profile dropdown */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-canvas"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium leading-tight text-ink">
                  {userName}
                </p>
                <p className="text-[11px] leading-tight text-muted">
                  {orgName} · {planLabel}
                </p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-hairline bg-white p-1.5 shadow-lg">
                {/* User info */}
                <div className="border-b border-hairline px-3 py-2.5">
                  <p className="text-sm font-medium text-ink">{userName}</p>
                  <p className="text-xs text-muted">{orgName}</p>
                  <span className="mt-1 inline-block rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
                    {userRole} · {planLabel}
                  </span>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/app/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                  >
                    <User className="h-4 w-4 text-muted" />
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                  >
                    <Settings className="h-4 w-4 text-muted" />
                    Settings
                  </Link>
                  {platformRole === "admin" ? (
                    <Link
                      href="/admin"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                    >
                      <Building2 className="h-4 w-4 text-muted" />
                      Admin Dashboard
                    </Link>
                  ) : null}
                  <Link
                    href="/app/constitution"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                  >
                    <HelpCircle className="h-4 w-4 text-muted" />
                    Help & Docs
                  </Link>
                </div>

                {/* Logout */}
                <div className="border-t border-hairline pt-1">
                  <button
                    onClick={async () => {
                      setProfileOpen(false);
                      await fetch("/api/auth/logout", { method: "POST" });
                      router.push("/login");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-hairline bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              <Search className="h-4 w-4 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents, goals, tasks..."
                className="flex-1 bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-muted"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-canvas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              <p className="px-3 py-2 text-xs font-medium text-muted">
                {searchQuery
                  ? `Searching for "${searchQuery}"...`
                  : "Type to search across your organization"}
              </p>
              {!searchQuery && (
                <div className="space-y-0.5">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                    Quick links
                  </p>
                  {[
                    { label: "Dashboard", href: "/app", icon: "📊" },
                    { label: "AI Employees", href: "/app/agents", icon: "🤖" },
                    { label: "Goals & Tasks", href: "/app/goals", icon: "🎯" },
                    { label: "Approvals", href: "/app/approvals", icon: "✅" },
                    { label: "Memory", href: "/app/memory", icon: "🧠" },
                    { label: "Settings", href: "/settings", icon: "⚙️" },
                  ].map((item) => (
                    <button
                      key={item.href}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(item.href);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                    >
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
