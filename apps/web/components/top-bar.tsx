"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { analytics, resetAnalytics } from "@/lib/analytics";
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
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8">
        {/* Left: breadcrumb */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 text-2sm text-gray-400">
            <Building2 className="h-4 w-4" />
            <span>{orgName}</span>
            <span className="text-gray-200">·</span>
            <span className="capitalize">{plan}</span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {/* Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-2sm text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-3xs font-medium text-gray-400">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <NotificationsBell />

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
            >
              <div className="h-8 w-8 rounded-full bg-orq8-green flex items-center justify-center text-xs font-bold text-orq8-lime">
                {initials}
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-100 bg-white py-2 shadow-lg">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-2sm font-medium text-gray-900">{userName}</p>
                  <p className="text-overline text-gray-400">{orgName}</p>
                </div>
                <div className="py-1">
                  <Link href="/app/profile" className="flex items-center gap-2 px-4 py-2 text-2sm text-gray-600 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                    <User className="h-4 w-4" /> Profile
                  </Link>
                  <Link href="/settings" className="flex items-center gap-2 px-4 py-2 text-2sm text-gray-600 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                  {platformRole === "admin" && (
                    <Link href="/admin" className="flex items-center gap-2 px-4 py-2 text-2sm text-orq8-orange hover:bg-orq8-orange/5" onClick={() => setProfileOpen(false)}>
                      <Command className="h-4 w-4" /> Admin Dashboard
                    </Link>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-1">
                  <Link
                    href="/api/auth/logout"
                    className="flex items-center gap-2 px-4 py-2 text-2sm text-gray-500 hover:bg-gray-50"
                    onClick={() => {
                      setProfileOpen(false);
                      analytics.userLoggedOut();
                      resetAnalytics();
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </Link>
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
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-100 px-4">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search commands, agents, goals..."
                className="flex-1 bg-transparent py-4 text-md text-gray-900 outline-none placeholder:text-gray-400"
              />
              <button onClick={() => setSearchOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3 text-2sm text-gray-400">
              Type to search across your organization...
            </div>
          </div>
        </div>
      )}
    </>
  );
}
