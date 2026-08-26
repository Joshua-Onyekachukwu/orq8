"use client";

import React, { useState } from "react";

interface Feature {
  id: string;
  icon: string;
  tag: string;
  title: string;
  description: string;
  visual: "gates" | "agents" | "command" | "goals" | "memory" | "routing" | "audit" | "report";
}

const features: Feature[] = [
  {
    id: "agents",
    icon: "ri-team-fill",
    tag: "AI Employees",
    title: "Hire specialists on demand",
    description: "Build a team of specialized AI employees. A researcher, writer, engineer, analyst - each with defined roles, budgets, and authority. They form departments, join projects, and execute together.",
    visual: "agents",
  },
  {
    id: "command",
    icon: "ri-dashboard-3-fill",
    tag: "Command Center",
    title: "See everything, decide what matters",
    description: "Your command center shows the live state of your organization. Active agents, running tasks, priorities, performance, and costs - all in one view. Executive visibility without the noise.",
    visual: "command",
  },
  {
    id: "gates",
    icon: "ri-shield-check-fill",
    tag: "Approval Gates",
    title: "AI proposes. You decide.",
    description: "Important actions route to you before they execute. Spend, publish, deploy - anything consequential comes through your approval gates. Approve, reject, or modify in one tap.",
    visual: "gates",
  },
  {
    id: "goals",
    icon: "ri-target-fill",
    tag: "Goals & Tasks",
    title: "Set the direction. Watch it execute.",
    description: "Define company goals in plain language. The system breaks them into tasks, assigns the right agents, sets priorities, and tracks progress. You manage the company, not every task.",
    visual: "goals",
  },
  {
    id: "memory",
    icon: "ri-database-2-fill",
    tag: "Company Memory",
    title: "Decisions that compound over time",
    description: "ORQ8 remembers every decision, lesson, and outcome. Your organizational context grows from day one. The company gets smarter the longer it works with you.",
    visual: "memory",
  },
  {
    id: "routing",
    icon: "ri-cpu-fill",
    tag: "Model Routing",
    title: "The right intelligence for the right job",
    description: "Route work to the appropriate AI model based on the task. Use free local models for routine work, or your own API keys for frontier intelligence. You choose. No lock-in.",
    visual: "routing",
  },
  {
    id: "audit",
    icon: "ri-file-list-3-fill",
    tag: "Audit Trail",
    title: "Every action, every dollar, tracked",
    description: "Every decision, action, and cost is time-stamped and immutable. Your company has a complete operational record you can trust and review at any time.",
    visual: "audit",
  },
  {
    id: "report",
    icon: "ri-file-chart-fill",
    tag: "Monday Report",
    title: "Your company reports to you",
    description: "Every Monday: what happened, what was accomplished, what needs attention, what went wrong, and what should happen next. Executive reporting in five minutes.",
    visual: "report",
  },
];

/* Mini interactive previews for each feature */
function FeaturePreview({ visual, isActive }: { visual: Feature["visual"]; isActive: boolean }) {
  switch (visual) {
    case "agents":
      return (
        <div className="space-y-2">
          {[
            { role: "Researcher", task: "Analyzing market data", status: "active", color: "bg-emerald" },
            { role: "Writer", task: "Drafting launch post", status: "active", color: "bg-primary-500" },
            { role: "Engineer", task: "Reviewing PR #142", status: "active", color: "bg-lime" },
            { role: "Analyst", task: "Budget report", status: "queued", color: "bg-gray-300" },
          ].map((a) => (
            <div key={a.role} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${a.color}`} />
                <span className="text-xs font-medium text-white/90">{a.role}</span>
              </div>
              <span className="text-[10px] text-white/50">{a.task}</span>
            </div>
          ))}
        </div>
      );

    case "command":
      return (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Active", value: "03", color: "text-emerald" },
            { label: "Tasks", value: "14", color: "text-primary-500" },
            { label: "Spend", value: "$14", color: "text-lime" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/5 border border-white/10 p-2">
              <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[9px] uppercase tracking-wider text-white/40">{s.label}</p>
            </div>
          ))}
        </div>
      );

    case "gates":
      return (
        <div className="rounded-lg border border-lime/30 bg-white/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-5 w-5 rounded-full bg-lime flex items-center justify-center text-[10px] font-bold text-navy-950">!</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-lime">Approval Required</span>
          </div>
          <p className="text-xs text-white/80 mb-2">Marketing requests <span className="font-semibold text-lime">$250</span> for LinkedIn campaign</p>
          <div className="flex gap-2">
            <span className="flex-1 text-center rounded-full bg-lime text-navy-950 text-[10px] font-semibold py-1">Approve</span>
            <span className="flex-1 text-center rounded-full border border-white/20 text-white/60 text-[10px] py-1">Reject</span>
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
            <div key={g.goal} className="rounded-lg bg-white/5 border border-white/10 p-2">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-white/80">{g.goal}</span>
                <span className="text-emerald">{g.progress}</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full">
                <div className={`h-full bg-emerald rounded-full ${g.bar}`} />
              </div>
            </div>
          ))}
        </div>
      );

    case "memory":
      return (
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
          {[
            { time: "Aug 12", event: "Pricing decision: $49/mo Pro tier" },
            { time: "Aug 10", event: "Lesson: LinkedIn ads outperform Twitter 3:1" },
            { time: "Aug 08", event: "Precedent: Newsletter format approved by CEO" },
          ].map((e) => (
            <div key={e.time} className="flex items-start gap-2">
              <span className="text-[9px] text-white/30 font-mono mt-0.5 shrink-0">{e.time}</span>
              <span className="text-[11px] text-white/70">{e.event}</span>
            </div>
          ))}
        </div>
      );

    case "routing":
      return (
        <div className="space-y-2">
          {[
            { task: "Draft email", model: "GPT-4o", cost: "$0.01" },
            { task: "Analyze data", model: "Claude", cost: "$0.08" },
            { task: "Summarize docs", model: "Local (Ollama)", cost: "$0.00" },
          ].map((r) => (
            <div key={r.task} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <span className="text-xs text-white/80">{r.task}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-primary-400">{r.model}</span>
                <span className="text-[10px] text-emerald">{r.cost}</span>
              </div>
            </div>
          ))}
        </div>
      );

    case "audit":
      return (
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-1.5">
          {[
            { time: "09:42", action: "Agent deployed PR #142", status: "completed" },
            { time: "09:38", action: "CEO approved $250 spend", status: "approved" },
            { time: "09:15", action: "Researcher updated market map", status: "logged" },
          ].map((a) => (
            <div key={a.time} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-white/30">{a.time}</span>
              <span className="text-white/70">{a.action}</span>
            </div>
          ))}
        </div>
      );

    case "report":
      return (
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-white/90">Weekly Report</span>
            <span className="text-[10px] text-white/30">Aug 11-17</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald" /><span className="text-white/70">3 tasks completed</span></div>
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /><span className="text-white/70">1 blocked (needs decision)</span></div>
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary-400" /><span className="text-white/70">Spend: $14.20 of $20</span></div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

/* Desktop: ORQ8 core with features orbiting */
function DesktopFeatures({ activeId, setActiveId }: { activeId: string | null; setActiveId: (id: string | null) => void }) {
  const featurePositions = [
    "ltr:left-0 rtl:right-0 top-0",
    "ltr:right-0 rtl:left-0 top-0",
    "ltr:left-0 rtl:right-0 top-[33%] -translate-y-1/2",
    "ltr:right-0 rtl:left-0 top-[33%] -translate-y-1/2",
    "ltr:left-0 rtl:right-0 bottom-[33%] translate-y-1/2",
    "ltr:right-0 rtl:left-0 bottom-[33%] translate-y-1/2",
    "ltr:left-0 rtl:right-0 bottom-0",
    "ltr:right-0 rtl:left-0 bottom-0",
  ];

  const connectorEndpoints: [number, number][] = [
    [8, 12], [92, 12],
    [8, 42], [92, 42],
    [8, 58], [92, 58],
    [8, 88], [92, 88],
  ];

  return (
    <div className="hidden lg:block relative h-[780px] xl:h-[820px]">
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full z-[1]" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {features.map((f, i) => (
          <line
            key={f.id}
            x1="50" y1="50"
            x2={connectorEndpoints[i][0]} y2={connectorEndpoints[i][1]}
            stroke={activeId === f.id ? "rgba(96,93,255,0.85)" : "rgba(96,93,255,0.25)"}
            strokeWidth={activeId === f.id ? 0.35 : 0.18}
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

      {/* Feature cards */}
      {features.map((f, i) => (
        <div key={f.id} className={`absolute ${featurePositions[i]} z-[2]`}>
          <div className="feature-float" style={{ "--float-delay": `${(i % 4) * 0.7}s` } as React.CSSProperties}>
            <div
              className={`group w-[280px] xl:w-[300px] rounded-[16px] border shadow-sm px-[18px] py-[16px] transition-all duration-300 cursor-pointer ${
                activeId === f.id
                  ? "bg-navy-900 border-primary-500/50 shadow-[0_8px_32px_-8px_rgba(96,93,255,0.3)]"
                  : "bg-white border-gray-100 dark:bg-navy-900 dark:border-white/15 hover:border-primary-500/30"
              }`}
              onMouseEnter={() => setActiveId(f.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              <div className="flex items-center gap-[10px] mb-[10px]">
                <div className={`w-[36px] h-[36px] rounded-[10px] flex items-center justify-center flex-none transition-colors duration-200 ${
                  activeId === f.id ? "bg-primary-500" : "bg-[#eef] dark:bg-white/10"
                }`}>
                  <i className={`${f.icon} text-[18px] leading-none transition-colors duration-200 ${
                    activeId === f.id ? "text-white" : "text-primary-500"
                  }`} />
                </div>
                <div>
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-500">{f.tag}</span>
                  <h3 className="!mb-0 !font-semibold !text-[15px] -tracking-[0.2px]">{f.title}</h3>
                </div>
              </div>
              <p className="!mb-0 text-[12.5px] leading-relaxed text-gray-500 dark:text-gray-400">{f.description}</p>
              {activeId === f.id && (
                <div className="mt-3 pt-3 border-t border-white/10 animate-fade-in">
                  <FeaturePreview visual={f.visual} isActive={true} />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* Mobile: compact core + expandable cards */
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
                ? "bg-navy-900 border-primary-500/50"
                : "bg-white border-gray-100 dark:bg-navy-900 dark:border-white/15"
            }`}
            onClick={() => setActiveId(activeId === f.id ? null : f.id)}
          >
            <div className="flex items-center gap-[10px] mb-[6px]">
              <div className={`w-[32px] h-[32px] rounded-[8px] flex items-center justify-center flex-none transition-colors ${
                activeId === f.id ? "bg-primary-500" : "bg-[#eef] dark:bg-white/10"
              }`}>
                <i className={`${f.icon} text-[16px] leading-none transition-colors ${
                  activeId === f.id ? "text-white" : "text-primary-500"
                }`} />
              </div>
              <h3 className="!mb-0 !font-semibold !text-[14px]">{f.title}</h3>
            </div>
            <p className="!mb-0 text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">{f.description}</p>
            {activeId === f.id && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10">
                <FeaturePreview visual={f.visual} isActive={true} />
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
    <div
      id="features"
      className="relative z-[1] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] scroll-mt-[100px]"
    >
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
            What ORQ8 Can Do
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            An operating system,<br />
            <span className="text-primary-500">not a chatbot</span>
          </h2>
          <p className="mt-[12px] md:mt-[16px] text-gray-500 dark:text-gray-400 text-[14px] md:text-[15px]">
            Hover over each capability to see a preview of how ORQ8 works.
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
