"use client";

import React, { useState } from "react";

interface Feature {
  id: string;
  icon: string;
  tag: string;
  title: string;
  description: string;
  visual: "agents" | "command" | "gates" | "goals" | "memory" | "audit";
}

const features: Feature[] = [
  {
    id: "agents",
    icon: "ri-team-fill",
    tag: "AI Employees",
    title: "Hire specialists on demand",
    description: "Build a team of specialized AI employees with defined roles, budgets, and authority. They execute together.",
    visual: "agents",
  },
  {
    id: "command",
    icon: "ri-dashboard-3-fill",
    tag: "Command Center",
    title: "See everything, decide what matters",
    description: "Live state of your organization. Active agents, tasks, costs — executive visibility without the noise.",
    visual: "command",
  },
  {
    id: "gates",
    icon: "ri-shield-check-fill",
    tag: "Approval Gates",
    title: "AI proposes. You decide.",
    description: "Consequential actions route to you. Approve, reject, or modify in one tap. Everything else runs.",
    visual: "gates",
  },
  {
    id: "goals",
    icon: "ri-target-fill",
    tag: "Goals & Tasks",
    title: "Set the direction. Watch it execute.",
    description: "Define goals in plain language. The system breaks them into tasks, assigns agents, and tracks progress.",
    visual: "goals",
  },
  {
    id: "memory",
    icon: "ri-database-2-fill",
    tag: "Company Memory",
    title: "Decisions that compound over time",
    description: "Every decision, lesson, and outcome accumulates. Your company gets smarter the longer it works with you.",
    visual: "memory",
  },
  {
    id: "audit",
    icon: "ri-file-list-3-fill",
    tag: "Audit Trail",
    title: "Every action, every dollar, tracked",
    description: "Time-stamped and immutable. Your company has a complete operational record you can trust from day one.",
    visual: "audit",
  },
];

/* Preview panels — light theme for white card backgrounds */
function FeaturePreview({ visual }: { visual: Feature["visual"] }) {
  switch (visual) {
    case "agents":
      return (
        <div className="space-y-2">
          {[
            { role: "Researcher", task: "Analyzing market data", color: "bg-emerald" },
            { role: "Writer", task: "Drafting launch post", color: "bg-primary-500" },
            { role: "Engineer", task: "Reviewing PR #142", color: "bg-lime" },
          ].map((a) => (
            <div key={a.role} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${a.color}`} />
                <span className="text-xs font-medium text-gray-700">{a.role}</span>
              </div>
              <span className="text-[10px] text-gray-400">{a.task}</span>
            </div>
          ))}
        </div>
      );

    case "command":
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Active", value: "03", color: "text-emerald-600" },
            { label: "Tasks", value: "14", color: "text-primary-500" },
            { label: "Spend", value: "$14", color: "text-lime-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-gray-50 border border-gray-200 p-2">
              <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[9px] uppercase tracking-wider text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      );

    case "gates":
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-5 w-5 rounded-full bg-amber-400 flex items-center justify-center text-[10px] font-bold text-white">!</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Approval Required</span>
          </div>
          <p className="text-xs text-gray-600 mb-2">Marketing requests <span className="font-semibold text-amber-600">$250</span> for LinkedIn campaign</p>
          <div className="flex gap-2">
            <span className="flex-1 text-center rounded-full bg-lime text-navy-950 text-[10px] font-semibold py-1">Approve</span>
            <span className="flex-1 text-center rounded-full border border-gray-300 text-gray-500 text-[10px] py-1">Reject</span>
          </div>
        </div>
      );

    case "goals":
      return (
        <div className="space-y-2">
          {[
            { goal: "Launch newsletter", progress: "68%", bar: "w-[68%]" },
            { goal: "Market research", progress: "42%", bar: "w-[42%]" },
            { goal: "Onboard users", progress: "15%", bar: "w-[15%]" },
          ].map((g) => (
            <div key={g.goal} className="rounded-lg bg-gray-50 border border-gray-200 p-2">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-gray-600">{g.goal}</span>
                <span className="text-emerald-600 font-medium">{g.progress}</span>
              </div>
              <div className="h-1 bg-gray-200 rounded-full">
                <div className={`h-full bg-emerald-500 rounded-full ${g.bar}`} />
              </div>
            </div>
          ))}
        </div>
      );

    case "memory":
      return (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
          {[
            { time: "Aug 12", event: "Pricing decision: $49/mo Pro tier" },
            { time: "Aug 10", event: "Lesson: LinkedIn ads outperform Twitter 3:1" },
            { time: "Aug 08", event: "Precedent: Newsletter format approved by CEO" },
          ].map((e) => (
            <div key={e.time} className="flex items-start gap-2">
              <span className="text-[9px] text-gray-400 font-mono mt-0.5 shrink-0">{e.time}</span>
              <span className="text-[11px] text-gray-600">{e.event}</span>
            </div>
          ))}
        </div>
      );

    case "audit":
      return (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
          {[
            { time: "09:42", action: "Agent deployed PR #142" },
            { time: "09:38", action: "CEO approved $250 spend" },
            { time: "09:15", action: "Researcher updated market map" },
          ].map((a) => (
            <div key={a.time} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-gray-400">{a.time}</span>
              <span className="text-gray-600">{a.action}</span>
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}

/* Desktop: ORQ8 core with 6 features orbiting — 3 per side, evenly spaced */
function DesktopFeatures({ activeId, setActiveId }: { activeId: string | null; setActiveId: (id: string | null) => void }) {
  const leftPositions = [
    "left-0 top-0",
    "left-0 top-1/2 -translate-y-1/2",
    "left-0 bottom-0",
  ];
  const rightPositions = [
    "right-0 top-0",
    "right-0 top-1/2 -translate-y-1/2",
    "right-0 bottom-0",
  ];

  const leftEndpoints: [number, number][] = [
    [8, 15],
    [5, 50],
    [8, 85],
  ];
  const rightEndpoints: [number, number][] = [
    [92, 15],
    [95, 50],
    [92, 85],
  ];

  return (
    <div className="hidden lg:block relative h-[780px] xl:h-[820px]">
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full z-[1]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {[...leftEndpoints, ...rightEndpoints].map((ep, i) => (
          <line
            key={i}
            x1="50" y1="50"
            x2={ep[0]} y2={ep[1]}
            stroke={activeId === features[i]?.id ? "rgba(96,93,255,0.85)" : "rgba(96,93,255,0.25)"}
            strokeWidth={activeId === features[i]?.id ? 0.35 : 0.18}
            className="orbit-connector transition-all duration-300"
          />
        ))}
      </svg>

      {/* Center hub */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]">
        <div aria-hidden className="absolute w-[400px] h-[400px] rounded-full bg-lime blur-[110px] opacity-[0.10]" />
        <div className="absolute w-[360px] h-[360px]">
          <div className="animate-orbit-slower absolute inset-0 rounded-full border border-dashed border-white/15">
            <span className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-primary-500/70" />
            <span className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-primary-500/70" />
          </div>
        </div>
        <div className="absolute w-[280px] h-[280px]">
          <div className="animate-orbit-slow absolute inset-0 rounded-full border border-dashed border-white/15">
            <span className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-[10px] h-[10px] rounded-full bg-lime animate-pulse-dot" />
            <span className="absolute top-1/2 -translate-y-1/2 -left-[5px] w-[10px] h-[10px] rounded-full bg-lime animate-pulse-dot" />
          </div>
        </div>
        <div className="relative bg-navy-950 w-[200px] h-[200px] rounded-full flex flex-col items-center justify-center border border-white/10 shadow-[0_20px_60px_-15px_rgba(13,20,39,0.55)]">
          <span className="text-white text-[34px] font-bold tracking-[-1.8px] leading-none">ORQ8</span>
          <span className="mt-[12px] flex items-center gap-[7px]">
            <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot" />
            <span className="text-[9px] font-semibold uppercase tracking-[2.4px] text-white/60">System Online</span>
          </span>
        </div>
      </div>

      {/* Feature cards — left 3 */}
      {features.slice(0, 3).map((f, i) => (
        <div key={f.id} className={`absolute ${leftPositions[i]} z-[2]`}>
          <div className="feature-float" style={{ "--float-delay": `${i * 0.9}s` } as React.CSSProperties}>
            <div
              className={`group w-[280px] xl:w-[300px] rounded-[16px] border shadow-sm px-[18px] py-[16px] transition-all duration-300 cursor-pointer ${
                activeId === f.id
                  ? "bg-white border-primary-500/40 shadow-[0_8px_32px_-8px_rgba(96,93,255,0.25)]"
                  : "bg-white border-gray-200 hover:border-primary-500/30 hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]"
              }`}
              onMouseEnter={() => setActiveId(f.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              <div className="flex items-center gap-[10px] mb-[10px]">
                <div className={`w-[36px] h-[36px] rounded-[10px] flex items-center justify-center flex-none transition-colors duration-200 ${
                  activeId === f.id ? "bg-primary-500" : "bg-gray-100"
                }`}>
                  <i className={`${f.icon} text-[18px] leading-none transition-colors duration-200 ${
                    activeId === f.id ? "text-white" : "text-primary-500"
                  }`} />
                </div>
                <div>
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-500">{f.tag}</span>
                  <h3 className="!mb-0 !font-semibold !text-[15px] -tracking-[0.2px] text-gray-900">{f.title}</h3>
                </div>
              </div>
              <p className="!mb-0 text-[12.5px] leading-relaxed text-gray-500">{f.description}</p>
              {activeId === f.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 animate-fade-in">
                  <FeaturePreview visual={f.visual} />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Feature cards — right 3 */}
      {features.slice(3, 6).map((f, i) => (
        <div key={f.id} className={`absolute ${rightPositions[i]} z-[2]`}>
          <div className="feature-float" style={{ "--float-delay": `${(i + 3) * 0.9}s` } as React.CSSProperties}>
            <div
              className={`group w-[280px] xl:w-[300px] rounded-[16px] border shadow-sm px-[18px] py-[16px] transition-all duration-300 cursor-pointer ${
                activeId === f.id
                  ? "bg-white border-primary-500/40 shadow-[0_8px_32px_-8px_rgba(96,93,255,0.25)]"
                  : "bg-white border-gray-200 hover:border-primary-500/30 hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]"
              }`}
              onMouseEnter={() => setActiveId(f.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              <div className="flex items-center gap-[10px] mb-[10px]">
                <div className={`w-[36px] h-[36px] rounded-[10px] flex items-center justify-center flex-none transition-colors duration-200 ${
                  activeId === f.id ? "bg-primary-500" : "bg-gray-100"
                }`}>
                  <i className={`${f.icon} text-[18px] leading-none transition-colors duration-200 ${
                    activeId === f.id ? "text-white" : "text-primary-500"
                  }`} />
                </div>
                <div>
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-500">{f.tag}</span>
                  <h3 className="!mb-0 !font-semibold !text-[15px] -tracking-[0.2px] text-gray-900">{f.title}</h3>
                </div>
              </div>
              <p className="!mb-0 text-[12.5px] leading-relaxed text-gray-500">{f.description}</p>
              {activeId === f.id && (
                <div className="mt-3 pt-3 border-t border-gray-100 animate-fade-in">
                  <FeaturePreview visual={f.visual} />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Mobile: compact core + card grid */
function MobileFeatures({ activeId, setActiveId }: { activeId: string | null; setActiveId: (id: string | null) => void }) {
  return (
    <div className="lg:hidden">
      {/* Compact core */}
      <div className="relative w-[150px] h-[150px] mx-auto mb-[34px]">
        <div aria-hidden className="absolute inset-0 rounded-full bg-lime blur-[60px] opacity-[0.14]" />
        <div className="relative w-full h-full rounded-full bg-navy-950 border border-white/10 shadow-[0_20px_50px_-18px_rgba(13,20,39,0.6)] flex flex-col items-center justify-center">
          <span className="text-white text-[26px] font-bold tracking-[-1.4px] leading-none">ORQ8</span>
          <span className="mt-[10px] flex items-center gap-[7px]">
            <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot" />
            <span className="text-[8px] font-semibold uppercase tracking-[2.2px] text-white/60">System Online</span>
          </span>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px]">
        {features.map((f) => (
          <div
            key={f.id}
            className={`rounded-[14px] border shadow-sm px-[16px] py-[14px] transition-all duration-200 ${
              activeId === f.id
                ? "bg-white border-primary-500/40"
                : "bg-white border-gray-200 hover:border-primary-500/30"
            }`}
            onClick={() => setActiveId(activeId === f.id ? null : f.id)}
          >
            <div className="flex items-center gap-[10px] mb-[6px]">
              <div className={`w-[32px] h-[32px] rounded-[8px] flex items-center justify-center flex-none transition-colors ${
                activeId === f.id ? "bg-primary-500" : "bg-gray-100"
              }`}>
                <i className={`${f.icon} text-[16px] leading-none transition-colors ${
                  activeId === f.id ? "text-white" : "text-primary-500"
                }`} />
              </div>
              <h3 className="!mb-0 !font-semibold !text-[14px] text-gray-900">{f.title}</h3>
            </div>
            <p className="!mb-0 text-[12px] leading-relaxed text-gray-500">{f.description}</p>
            {activeId === f.id && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <FeaturePreview visual={f.visual} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const Features: React.FC = () => {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div id="features" className="relative z-[1] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] scroll-mt-[100px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
            What ORQ8 Can Do
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px] text-white">
            An operating system,
            <br />
            <span className="text-primary-500">not a chatbot</span>
          </h2>
          <p className="mt-[12px] md:mt-[16px] text-white/50 text-[14px] md:text-[15px]">
            Six capabilities orbiting one central intelligence.
          </p>
        </div>

        <DesktopFeatures activeId={activeId} setActiveId={setActiveId} />
        <MobileFeatures activeId={activeId} setActiveId={setActiveId} />
      </div>

      {/* Background glows */}
      <div className="bg-lime blur-[302px] opacity-[0.6] dark:opacity-[0.12] rounded-[672px] w-[320px] md:w-[672px] h-[527px] absolute -z-[1] ltr:left-0 rtl:right-0 ltr:md:left-[10%] rtl:md:right-[10%] ltr:lg:left-[20%] rtl:lg:right-[20%] bottom-[50%] md:bottom-[10%]" />
      <div className="bg-primary-500 blur-[362px] opacity-[0.6] dark:opacity-[0.12] rounded-[556px] w-[320px] md:w-[556px] h-[466px] absolute -z-[1] ltr:right-0 rtl:left-0 ltr:md:right-[20%] rtl:md:left-[20%] bottom-[10%]" />
    </div>
  );
};

export default Features;
