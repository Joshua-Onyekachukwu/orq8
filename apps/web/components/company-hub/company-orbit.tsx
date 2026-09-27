"use client";

/**
 * CompanyOrbit — the Company Hub's single, dominant surface.
 *
 * A dark orbital diagram: the ORQ8 core at the centre, two orbit rings, and
 * six satellites around it. Each satellite is a real system of the operating
 * company (Executive Agent, Audit Trail, AI Workforce, Company Memory,
 * Approval Gates, Goals & Tasks) and carries a figure read from the backend,
 * so the diagram is an operating console rather than a static illustration.
 *
 * Nothing here is invented. When the company has no such records yet, the
 * satellite says so instead of showing a zero dressed up as progress.
 */

import Link from "next/link";
import {
  CircleDot,
  Database,
  ScrollText,
  ShieldCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useExecutiveAgent } from "../executive-agent-context";

type Tone = "lime" | "orange" | "muted";

interface Satellite {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  metric: string;
  tone: Tone;
  /** Where the satellite leads. Absent when the satellite opens the EA panel. */
  href?: string;
  /** Starter prompt handed to the Executive Agent (Executive Agent satellite). */
  prompt?: string;
}

export interface CompanyOrbitProps {
  companyName: string;
  employees: number;
  departments: number;
  working: number;
  waiting: number;
  blocked: number;
  pendingApprovals: number;
  activeGoals: number;
  openTasks: number;
  memories: number;
  auditEvents: number;
  /** Pre-formatted on the server so the relative time cannot drift on hydration. */
  lastActivityLabel: string | null;
}

const EA_PROMPT = "Give me the state of my company and what needs me.";

/** Six positions around the orbit: top, upper-left, upper-right, lower-left, lower-right, bottom. */
const ORBIT_POSITION: Record<string, string> = {
  ea: "left-1/2 top-[12%] -translate-x-1/2 -translate-y-1/2",
  audit: "left-[16%] top-[33%] -translate-x-1/2 -translate-y-1/2",
  workforce: "left-[84%] top-[33%] -translate-x-1/2 -translate-y-1/2",
  memory: "left-[16%] top-[71%] -translate-x-1/2 -translate-y-1/2",
  approvals: "left-[84%] top-[71%] -translate-x-1/2 -translate-y-1/2",
  goals: "left-1/2 top-[88%] -translate-x-1/2 -translate-y-1/2",
};

const TONE_METRIC: Record<Tone, string> = {
  lime: "text-orq8-lime",
  orange: "text-orq8-orange-bright",
  muted: "text-white/40",
};

const TONE_DOT: Record<Tone, string> = {
  lime: "bg-orq8-lime",
  orange: "bg-orq8-orange-bright",
  muted: "bg-white/30",
};

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildSatellites(p: CompanyOrbitProps): Satellite[] {
  return [
    {
      key: "ea",
      title: "Executive Agent",
      description: "Plans the work, hires specialists, coordinates execution.",
      icon: Zap,
      tone: p.blocked > 0 ? "orange" : "lime",
      metric:
        p.employees === 0
          ? "Ready to plan the first work"
          : p.working + p.waiting + p.blocked === 0
            ? "No work in flight"
            : `${p.working} working · ${p.waiting} waiting`,
      prompt: EA_PROMPT,
    },
    {
      key: "audit",
      title: "Audit Trail",
      description: "Every action, every dollar. Timestamped and immutable.",
      icon: ScrollText,
      tone: "muted",
      metric:
        p.auditEvents === 0 ? "No events recorded yet" : `${count(p.auditEvents, "event")} recorded`,
      href: "/app/audit",
    },
    {
      key: "workforce",
      title: "AI Workforce",
      description: "Specialized employees with defined roles and budgets.",
      icon: Users,
      tone: "lime",
      metric:
        p.employees === 0
          ? "No AI employees yet"
          : `${count(p.employees, "employee")} · ${count(p.departments, "department")}`,
      href: "/app/agents",
    },
    {
      key: "memory",
      title: "Company Memory",
      description: "Every decision accumulates. Your company gets smarter.",
      icon: Database,
      tone: "muted",
      metric:
        p.memories === 0
          ? "Nothing learned yet"
          : count(p.memories, "memory", "memories"),
      href: "/app/memory",
    },
    {
      key: "approvals",
      title: "Approval Gates",
      description: "AI proposes. You decide. Every consequential action.",
      icon: ShieldCheck,
      tone: p.pendingApprovals > 0 ? "orange" : "muted",
      metric:
        p.pendingApprovals > 0 ? `${p.pendingApprovals} waiting on you` : "Nothing waiting",
      href: "/app/approvals",
    },
    {
      key: "goals",
      title: "Goals & Tasks",
      description: "Set direction in plain language. Track progress automatically.",
      icon: CircleDot,
      tone: p.blocked > 0 ? "orange" : "lime",
      metric:
        p.activeGoals === 0 && p.openTasks === 0
          ? "No active goals yet"
          : `${count(p.activeGoals, "active goal")} · ${count(p.openTasks, "open task")}`,
      href: "/app/goals",
    },
  ];
}

/** One-line state of the company, built only from figures we actually have. */
function liveSummary(p: CompanyOrbitProps): string {
  if (p.employees === 0 && p.activeGoals === 0) return "No work is running yet.";
  const parts: string[] = [count(p.employees, "AI employee")];
  if (p.working > 0) parts.push(`${p.working} working`);
  if (p.pendingApprovals > 0) parts.push(`${p.pendingApprovals} waiting on you`);
  if (p.blocked > 0) parts.push(`${p.blocked} blocked`);
  return parts.join(" · ");
}

function SatelliteCard({ satellite }: { satellite: Satellite }) {
  const { openPanel } = useExecutiveAgent();
  const Icon = satellite.icon;

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-4 w-4 text-orq8-lime" aria-hidden="true" />
        <span
          className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[satellite.tone]}`}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-white">{satellite.title}</p>
      <p className="mt-1 text-2xs leading-snug text-white/50">{satellite.description}</p>
      <p className={`mt-3 font-mono text-3xs ${TONE_METRIC[satellite.tone]}`}>
        {satellite.metric}
      </p>
    </>
  );

  const className =
    "block h-full rounded-xl border border-white/10 bg-gray-900/70 p-4 transition-colors hover:border-white/25 hover:bg-gray-900";

  if (satellite.href) {
    return (
      <Link href={satellite.href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openPanel(satellite.prompt)}
      className={`${className} w-full text-left`}
    >
      {body}
    </button>
  );
}

/** The centre: the ORQ8 core. Clicking it hands the founder to the Executive Agent. */
function CoreNode({ compact = false }: { compact?: boolean }) {
  const { openPanel } = useExecutiveAgent();
  return (
    <button
      type="button"
      onClick={() => openPanel(EA_PROMPT)}
      aria-label="Ask the Executive Agent for the state of the company"
      className={`flex flex-col items-center justify-center rounded-full bg-white text-center shadow-[0_0_90px_rgba(184,255,102,0.18)] transition-transform hover:scale-[1.03] ${
        compact ? "h-32 w-32" : "h-40 w-40"
      }`}
    >
      <span
        className={`font-semibold tracking-tight text-orq8-dark ${compact ? "text-lg" : "text-xl"}`}
      >
        ORQ8
      </span>
      <span className="mt-1 font-mono text-3xs font-semibold uppercase tracking-[0.32em] text-orq8-orange">
        Core
      </span>
    </button>
  );
}

export function CompanyOrbit(props: CompanyOrbitProps) {
  const satellites = buildSatellites(props);
  const summary = liveSummary(props);

  return (
    <section aria-label="Company hub" className="rounded-2xl border border-white/10 bg-orq8-dark">
      <h2 className="sr-only">Company hub</h2>
      {/* Desktop: the orbital diagram. */}
      <div className="relative hidden min-h-[760px] lg:block">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[660px] w-[660px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/15"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.18] bg-white/[0.012] shadow-[inset_0_0_70px_rgba(184,255,102,0.06)]"
        />

        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <CoreNode />
        </div>

        <div className="absolute left-6 top-6 max-w-[280px]">
          <p className="font-mono text-3xs uppercase tracking-[0.2em] text-white/40">
            {props.companyName}
          </p>
          <p className="mt-1 text-2xs text-white/60">{summary}</p>
        </div>

        {satellites.map((satellite) => (
          <div key={satellite.key} className={`absolute w-[264px] ${ORBIT_POSITION[satellite.key]}`}>
            <SatelliteCard satellite={satellite} />
          </div>
        ))}

        {props.lastActivityLabel ? (
          <p className="absolute bottom-6 left-6 font-mono text-3xs text-white/35">
            Last change {props.lastActivityLabel}
          </p>
        ) : null}
      </div>

      {/* Tablet and phone: the same six satellites, stacked under the core. */}
      <div className="p-4 sm:p-6 lg:hidden">
        <div className="flex flex-col items-center gap-8">
          <div className="text-center">
            <p className="font-mono text-3xs uppercase tracking-[0.2em] text-white/40">
              {props.companyName}
            </p>
            <p className="mt-1 text-2xs text-white/60">{summary}</p>
          </div>
          <CoreNode compact />
          <div className="grid w-full gap-3 sm:grid-cols-2">
            {satellites.map((satellite) => (
              <SatelliteCard key={satellite.key} satellite={satellite} />
            ))}
          </div>
          {props.lastActivityLabel ? (
            <p className="font-mono text-3xs text-white/35">Last change {props.lastActivityLabel}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
