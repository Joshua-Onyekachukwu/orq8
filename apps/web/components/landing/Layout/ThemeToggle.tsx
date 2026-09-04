"use client";

import React from "react";
import { useTheme } from "next-themes";

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="relative flex items-center gap-[8px] rounded-full border border-white/20 dark:border-white/10 px-[12px] py-[6px] text-[11px] font-medium uppercase tracking-[0.12em] text-white/60 hover:text-white hover:border-white/30 transition-all"
    >
      {/* Sun icon */}
      <svg
        className={`w-[14px] h-[14px] transition-all duration-300 ${
          theme === "dark" ? "opacity-100 rotate-0" : "opacity-0 -rotate-90"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      {/* Moon icon */}
      <svg
        className={`w-[14px] h-[14px] transition-all duration-300 ${
          theme === "dark" ? "opacity-0 rotate-90" : "opacity-100 rotate-0"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    </button>
  );
};

export default ThemeToggle;
