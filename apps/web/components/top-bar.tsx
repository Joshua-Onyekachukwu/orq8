"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { analytics, resetAnalytics } from "@/lib/analytics";
import { UnverifiedEmailBanner } from "./unverified-email-banner";
import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
  Building2,
  Command,
  HelpCircle,
  X,
} from "lucide-react";
import { NotificationsBell } from "./notifications-bell";
import { AttentionBadge } from "./attention-badge";

interface TopBarProps {
  userName: string;
  userAvatarUrl?: string | null;
  orgName: string;
  plan: string;
  userRole: string;
  platformRole?: string;
}

export function TopBar({ userName, userAvatarUrl, orgName, plan, userRole, platformRole }: TopBarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Email verification nudge — renders nothing once verified */}
      <UnverifiedEmailBanner />
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-hairline-light bg-white/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8">
        {/* Left: breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Mobile menu toggle — sits in the sticky top bar so it is always
              reachable without scrolling (previously it was a bottom-pinned FAB). */}
          <button
            onClick={() => window.dispatchEvent(new Event("orq8:toggle-sidebar"))}
            aria-label="Toggle navigation menu"
            className="rounded-lg p-2 text-ink transition-colors hover:bg-surface-secondary lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden lg:flex items-center gap-2 text-2sm text-ink-muted">
            <Building2 className="h-4 w-4" />
            <span>{orgName}</span>
            <span className="text-ink-faint">·</span>
            <span className="capitalize">{plan}</span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-hairline bg-surface-secondary px-3 py-1.5 text-2sm text-ink transition-colors hover:border-hairline-strong"
          >
            <Search className="h-3.5 w-3.5 text-ink-muted" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-hairline bg-white px-1.5 py-0.5 text-3xs font-medium text-ink-muted">
              ⌘K
            </kbd>
          </button>

          {/* Founder's attention queue: approvals, blocked work, failures, credits */}
          <AttentionBadge />

          {/* Notifications */}
          <NotificationsBell />

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-secondary"
            >
              <div className="h-8 w-8 overflow-hidden rounded-full bg-brand-deep flex items-center justify-center text-xs font-bold text-ink-accent">
                {userAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userAvatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  initials
                )}
              </div>
              <ChevronDown className={`h-4 w-4 text-ink-muted transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-hairline-light bg-white py-2 shadow-lg">
                <div className="border-b border-hairline-light px-4 py-3">
                  <p className="text-2sm font-medium text-ink">{userName}</p>
                  <p className="text-overline text-ink-muted">{orgName}</p>
                </div>
                <div className="py-1">
                  <Link href="/app/profile" className="flex items-center gap-2 px-4 py-2 text-2sm text-ink hover:bg-surface-secondary" onClick={() => setProfileOpen(false)}>
                    <User className="h-4 w-4 text-ink-muted" /> Profile
                  </Link>
                  <Link href="/settings" className="flex items-center gap-2 px-4 py-2 text-2sm text-ink hover:bg-surface-secondary" onClick={() => setProfileOpen(false)}>
                    <Settings className="h-4 w-4 text-ink-muted" /> Settings
                  </Link>
                  {platformRole === "admin" && (
                    <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-2sm text-warm-ink hover:bg-warm/5" onClick={() => setProfileOpen(false)}>
                      <Command className="h-4 w-4" /> Admin Dashboard
                    </Link>
                  )}
                </div>
                <div className="border-t border-hairline-light pt-1">
                  <form action="/api/auth/logout" method="post">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 px-4 py-2 text-2sm text-ink-muted hover:bg-surface-secondary"
                      // NOTE: do not close the dropdown here — unmounting the
                      // form during click dispatch cancels the HTML form
                      // submission and sign-out silently does nothing. The
                      // 303 redirect to /login navigates the page anyway.
                      onClick={() => {
                        analytics.userLoggedOut();
                        resetAnalytics();
                      }}
                    >
                      <LogOut className="h-4 w-4 text-ink-muted" /> Sign out
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-hairline-light px-4">
              <Search className="h-5 w-5 text-ink-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search commands, agents, goals..."
                className="flex-1 bg-transparent py-4 text-md text-ink outline-none placeholder:text-ink-muted"
              />
              <button onClick={() => setSearchOpen(false)} className="rounded-lg p-1 text-ink-muted hover:bg-surface-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3 text-2sm text-ink-muted">
              Type to search across your organization...
            </div>
          </div>
        </div>
      )}
    </>
  );
}
