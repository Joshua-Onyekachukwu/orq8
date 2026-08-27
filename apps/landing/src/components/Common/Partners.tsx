"use client";

import React from "react";
import { useInView } from "@/hooks/useInView";

/* Marquee animation starts paused; IntersectionObserver resumes it when visible. */

/* ───────────────────────────────────────────────────────────────
   AI Employee identity system.
   Each employee gets: distinct color, SVG icon, role description.
   The marquee communicates: "One founder. One HQ. A whole operation running itself."
   ─────────────────────────────────────────────────────────────── */

interface AIEmployee {
  name: string;
  role: string;
  color: string;
  bgOpacity: string;
  svg: React.ReactNode;
}

const employees: AIEmployee[] = [
  {
    name: "Nimbus",
    role: "Research",
    color: "#4A9DFF",
    bgOpacity: "rgba(74,157,255,0.12)",
    svg: (
      <path
        d="M7 18.5a5.5 5.5 0 0 1-.6-10.96 6.75 6.75 0 0 1 13.2 1.46A4.5 4.5 0 0 1 19 18.5H7Z"
        fill="currentColor"
      />
    ),
  },
  {
    name: "Vertex",
    role: "Strategy",
    color: "#605DFF",
    bgOpacity: "rgba(96,93,255,0.12)",
    svg: (
      <path
        d="M12 3.5 21.5 19.5h-19L12 3.5Z"
        fill="currentColor"
      />
    ),
  },
  {
    name: "Orbit",
    role: "Coordination",
    color: "#8B5CF6",
    bgOpacity: "rgba(139,92,246,0.12)",
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="8" />
        <circle cx="19" cy="8" r="2.4" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  {
    name: "Lumen",
    role: "Design",
    color: "#F59E0B",
    bgOpacity: "rgba(245,158,11,0.12)",
    svg: (
      <g fill="currentColor">
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="2.5" r="1.6" />
        <circle cx="12" cy="21.5" r="1.6" />
        <circle cx="2.5" cy="12" r="1.6" />
        <circle cx="21.5" cy="12" r="1.6" />
      </g>
    ),
  },
  {
    name: "Forge",
    role: "Engineering",
    color: "#FF6B35",
    bgOpacity: "rgba(255,107,53,0.12)",
    svg: (
      <path
        d="M13.5 2 5 13.5h5L9 22l8.5-11.5h-5L13.5 2Z"
        fill="currentColor"
      />
    ),
  },
  {
    name: "Harbor",
    role: "Operations",
    color: "#0EA5A0",
    bgOpacity: "rgba(14,165,160,0.12)",
    svg: (
      <path
        d="M2 16c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-1.8 5-1M2 20c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-1.8 5-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    ),
  },
  {
    name: "Pulse",
    role: "Analytics",
    color: "#10B981",
    bgOpacity: "rgba(16,185,129,0.12)",
    svg: (
      <path
        d="M2 12h4l2.5-6 4 12 2.5-6h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "Aurora",
    role: "Marketing",
    color: "#EC4899",
    bgOpacity: "rgba(236,72,153,0.12)",
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 9c2.5-2.5 5-2.5 7.5 0s5 2.5 8.5 0" />
        <path d="M4 14c2.5-2.5 5-2.5 7.5 0s5 2.5 8.5 0" opacity=".55" />
        <path d="M4 19c2.5-2.5 5-2.5 7.5 0s5 2.5 8.5 0" opacity=".25" />
      </g>
    ),
  },
  {
    name: "Cobalt",
    role: "Security",
    color: "#3B82F6",
    bgOpacity: "rgba(59,130,246,0.12)",
    svg: (
      <path
        d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9L12 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "Merid",
    role: "Finance",
    color: "#8B9CB6",
    bgOpacity: "rgba(139,156,182,0.12)",
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 12a8 8 0 0 1 16 0" />
        <path d="M2.5 12h19" />
      </g>
    ),
  },
];

/* Two full copies of the sequence for a seamless -50% loop. */
const trackItems = [...employees, ...employees];

/* Single employee card */
const EmployeeCard: React.FC<{ emp: AIEmployee }> = ({ emp }) => (
  <div
    className="flex items-center gap-[14px] px-[20px] py-[14px] rounded-[14px] border border-gray-100 dark:border-white/[0.06] bg-white dark:bg-navy-900/60 shadow-sm hover:shadow-md transition-shadow whitespace-nowrap group"
  >
    {/* Icon circle with employee-specific color */}
    <div
      className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center flex-none transition-transform group-hover:scale-105"
      style={{ backgroundColor: emp.bgOpacity }}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[20px] h-[20px]"
        style={{ color: emp.color }}
        aria-hidden="true"
      >
        {emp.svg}
      </svg>
    </div>
    <div className="min-w-0">
      <span
        className="block text-[16px] font-semibold -tracking-[0.3px] leading-tight"
        style={{ color: emp.color }}
      >
        {emp.name}
      </span>
      <span className="block text-[12px] text-gray-400 dark:text-white/40 mt-[1px]">
        {emp.role}
      </span>
    </div>
  </div>
);

const Partners: React.FC = () => {
  const { ref: marqueeRef, inView: marqueeVisible } = useInView(0.05);

  return (
    <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Section header */}
        <div className="mx-auto text-center md:max-w-[580px] mb-[40px] md:mb-[50px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] md:mb-[12px]">
            Your AI Organization
          </span>
          <h2 className="!mb-[12px] !font-light !text-2xl md:!text-4xl lg:!text-[44px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.6px]">
            One founder. One HQ.{" "}
            <span className="font-normal text-navy-950 dark:text-white">
              A whole operation running itself.
            </span>
          </h2>
          <p className="!mb-0 mt-[12px] md:mt-[16px] text-gray-500 dark:text-gray-400 md:text-[15px] lg:text-md">
            Ten specialized AI employees. Each with a role, a budget, and authority.
            Together, they form your organization.
          </p>
        </div>
      </div>

      {/* Infinite marquee — right to left */}
      <div
        ref={marqueeRef}
        className="logo-marquee relative overflow-hidden"
        role="presentation"
        aria-label="AI employee team marquee"
      >
        <div className="logo-marquee-track flex items-center gap-[16px] md:gap-[20px] w-max ltr:pl-[16px] rtl:pr-[16px]" style={{ animationPlayState: marqueeVisible ? "running" : "paused" }}>
          {trackItems.map((emp, i) => (
            <EmployeeCard key={`${emp.name}-${i}`} emp={emp} />
          ))}
        </div>
      </div>

      {/* Subtle bottom tagline */}
      <div className="mt-[32px] md:mt-[44px] text-center">
        <p className="!mb-0 text-[13px] text-gray-400 dark:text-white/30 tracking-[0.5px]">
          Each employee operates within its own budget, under your approvals, with a full audit trail.
        </p>
      </div>
    </div>
  );
};

export default Partners;
