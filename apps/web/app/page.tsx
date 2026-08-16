import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { GrowthTree } from "../components/org-tree";
import { Reveal } from "../components/reveal";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { WaitlistForm } from "../components/waitlist-form";

export const metadata: Metadata = {
  title: "ORQ8: Run your company with AI employees",
  description:
    "You set the direction. ORQ8 hires the team, does the work, and reports back under your approvals and your budget.",
};

const MONO = "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/* ---- shared CTA treatments (one distinct CTA per section) ---- */
const primaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald px-8 text-sm font-semibold text-navy-950 transition-colors hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950";
const ghostCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-8 text-sm font-medium text-white/80 transition-colors hover:border-emerald/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950";
const outlineCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/25 px-8 text-sm font-medium text-white transition-colors hover:border-emerald hover:text-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950";
const textCta =
  "group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/55 transition-colors hover:text-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/50";

function Eyebrow({ index, text }: { index: string; text: string }) {
  return (
    <p className="eyebrow text-emerald">
      <span className="text-white/35">{index}</span>
      <span className="mx-2 text-white/20">/</span>
      <span className="text-white/60">{text}</span>
    </p>
  );
}

function FeatureIcon({ name, className = "" }: { name: string; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6Z" />
          <path d="m9.5 12 1.8 1.8 3.5-3.6" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="8" cy="14" r="4.5" />
          <path d="m11.5 10.5 8-8" />
          <path d="M16 5h3v3" />
        </svg>
      );
    case "scroll":
      return (
        <svg {...common}>
          <path d="M7 4h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 0-2 2v10" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "memory":
      return (
        <svg {...common}>
          <path d="M5 4h14v16l-7-4.5L5 20Z" />
          <path d="m9.5 9 2 2 3.5-4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V12" />
          <path d="M10 20V5" />
          <path d="M16 20V8" />
          <path d="M21 20H3" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M6 3h9l4 4v14H6Z" />
          <path d="M14 3v5h5" />
          <path d="M9.5 12.5h6" />
          <path d="M9.5 16h6" />
        </svg>
      );
    default:
      return null;
  }
}

/* Compact org-chart visual for the flagship feature card. */
function MiniOrg() {
  return (
    <svg viewBox="0 0 320 232" className="h-auto w-full" aria-hidden>
      {/* edges */}
      <g stroke="rgba(255,255,255,0.14)" strokeWidth={1}>
        <path d="M160 44 V78" />
        <path d="M160 94 V110 H64 V126" />
        <path d="M160 94 V110 H160 V126" />
        <path d="M160 94 V110 H256 V126" />
        <path d="M64 150 V168 H24 V186" />
        <path d="M64 150 V168 H64 V186" />
        <path d="M64 150 V168 H104 V186" />
        <path d="M160 150 V168 H128 V186" />
        <path d="M160 150 V168 H160 V186" />
        <path d="M160 150 V168 H192 V186" />
        <path d="M256 150 V168 H216 V186" />
        <path d="M256 150 V168 H256 V186" />
        <path d="M256 150 V168 H296 V186" />
      </g>
      {/* ceo */}
      <circle cx="160" cy="28" r="16" fill="none" stroke="var(--color-emerald)" strokeOpacity={0.35} strokeWidth={1} />
      <circle cx="160" cy="28" r="10" fill="var(--color-emerald)" />
      <circle cx="160" cy="28" r="3" fill="var(--color-navy-950)" />
      <text x="160" y="52" textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={8.5} letterSpacing={2.5} fontFamily={MONO}>
        YOU · CEO
      </text>
      {/* exec */}
      <circle cx="160" cy="94" r="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
      <circle cx="160" cy="94" r="2.5" fill="var(--color-emerald)" />
      {/* depts */}
      {["ENG", "MKTG", "R&D"].map((label, i) => {
        const x = 64 + i * 96;
        return (
          <g key={label}>
            <rect x={x - 40} y={126} width={80} height={24} rx={12} fill="var(--color-navy-surface)" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <text x={x} y={142} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={8} letterSpacing={2.5} fontFamily={MONO}>
              {label}
            </text>
          </g>
        );
      })}
      {/* staff */}
      {[24, 64, 104, 128, 160, 192, 216, 256, 296].map((x) => (
        <circle key={x} cx={x} cy={196} r={4} fill="rgba(255,255,255,0.28)" />
      ))}
    </svg>
  );
}

/* CEO dashboard mockup, the "command center" the product is. */
function CommandCenter() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(20rem_14rem_at_70%_10%,rgb(52_211_153/0.16),transparent_60%)]"
      />
      <div className="bg-grid-white relative overflow-hidden rounded-2xl border border-white/12 bg-navy-surface/90 p-5 shadow-[0_48px_100px_-48px_rgba(0,0,0,0.85)] backdrop-blur sm:p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/50">ORQ8 · Command Center</p>
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-glow rounded-full bg-emerald" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 text-center">
          {[
            { k: "Agents active", v: "03" },
            { k: "Tasks this week", v: "14" },
            { k: "Weekly spend", v: "$14.20" },
          ].map((s) => (
            <div key={s.k} className="px-2">
              <p className="text-2xl font-semibold tracking-tight text-white tabular-nums">{s.v}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">{s.k}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2 border-t border-white/10 pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">Active now</p>
          {[
            { n: "Researcher · α", s: "Analyzing market data" },
            { n: "Writer · α", s: "Drafting launch post" },
            { n: "Engineer · α", s: "Reviewing PR #142" },
          ].map((a) => (
            <div key={a.n} className="flex items-center justify-between rounded-lg border border-white/8 bg-navy-950/60 px-3 py-2">
              <p className="font-mono text-[10px] tracking-[0.08em] text-white/80">{a.n}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-fog">
                <span className="h-1 w-1 rounded-full bg-emerald" aria-hidden />
                {a.s}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-emerald/25 bg-navy-950/60 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald/50 text-[11px] font-semibold text-emerald">
              !
            </span>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">Approval required</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white">
            Marketing requests <span className="font-semibold text-emerald">$250</span> for a LinkedIn campaign.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="flex h-8 flex-1 items-center justify-center rounded-full bg-emerald text-xs font-semibold text-navy-950">
              Approve
            </span>
            <span className="flex h-8 flex-1 items-center justify-center rounded-full border border-white/20 text-xs text-white/80">
              Reject
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-navy-950/60 px-4 py-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Weekly cost</p>
            <p className="mt-1 flex items-baseline gap-2 text-lg font-semibold text-white">
              $14.20
              <span className="text-[10px] font-normal text-emerald">within budget</span>
            </p>
          </div>
          <svg viewBox="0 0 110 32" className="h-8 w-28" aria-hidden>
            <defs>
              <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-emerald)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-emerald)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d="M0 26 L14 22 L28 24 L42 17 L56 19 L70 12 L84 15 L98 7 L110 9 L110 32 L0 32 Z"
              fill="url(#spark)"
            />
            <path
              d="M0 26 L14 22 L28 24 L42 17 L56 19 L70 12 L84 15 L98 7 L110 9"
              fill="none"
              stroke="var(--color-emerald)"
              strokeWidth={1.5}
            />
          </svg>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-navy-950/60 px-4 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">Monday report · Ready</p>
          <span className="ml-auto font-mono text-[10px] text-white/30">Aug 15</span>
        </div>
      </div>
      <div className="animate-float absolute -right-3 -top-5 rotate-2 rounded-xl border border-emerald/30 bg-navy-950/95 px-4 py-2.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] sm:-right-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald">+1 agent hired</p>
        <p className="mt-0.5 text-[11px] text-fog">Marketing specialist · this week</p>
      </div>
    </div>
  );
}

const steps = [
  {
    n: "01",
    t: "Set your objective",
    d: "A sentence, a doc, a message. \u201CWe should launch a newsletter\u201D is a complete brief.",
  },
  {
    n: "02",
    t: "ORQ8 builds the organization",
    d: "An Executive Agent plans the work, then hires the specialists \u2014 researcher, writer, engineer \u2014 within your authority and budget.",
  },
  {
    n: "03",
    t: "You approve. It runs.",
    d: "Decisions that matter come to you. Everything else executes. Every Monday, the company reports back.",
  },
];

const features = [
  {
    icon: "shield",
    tag: "Approval gates",
    title: "You approve what matters",
    text: "Consequential actions route to you \u2014 a spend, a publish, a deploy. Approve or reject in one tap. Everything else runs.",
  },
  {
    icon: "key",
    tag: "Encrypted keys",
    title: "Secrets stay secret",
    text: "Provider credentials encrypted at rest, masked in the UI, and rotatable without downtime.",
  },
  {
    icon: "scroll",
    tag: "Audit trail",
    title: "Every action, recorded",
    text: "Decisions, changes, and costs are time-stamped and immutable. Your company has a memory you can trust.",
  },
  {
    icon: "memory",
    tag: "Company memory",
    title: "It learns on day one",
    text: "Decisions and lessons accumulate. Your organization gets smarter the longer it works with you.",
  },
  {
    icon: "chart",
    tag: "Cost-aware routing",
    title: "Spend is always visible",
    text: "Every task knows its budget. Costs are tracked per department and per agent \u2014 no surprises on the invoice.",
  },
  {
    icon: "doc",
    tag: "Weekly report",
    title: "The company reports back",
    text: "Every Monday: what happened, what\u2019s blocked, what it cost, what\u2019s next. Five minutes to read.",
  },
];

const pillars = [
  {
    t: "Approvals",
    d: "Consequential actions come to you. A spend. A publish. A deploy. You approve or reject. Everything else runs.",
  },
  {
    t: "Budgets",
    d: "Departments have allocations. Agents have limits. Nothing overspends without escalation.",
  },
  {
    t: "Governance",
    d: "Your company has a Constitution. Hard rules. Versioned. Auditable. Enforced, not suggested.",
  },
  {
    t: "Pause",
    d: "One agent. One department. The entire organization. Instantly, from your phone.",
  },
];

const reportRows = [
  { k: "Goals", v: "2 of 3 on track · 1 at risk" },
  { k: "Completed", v: "4 tasks · Landing page v2 live · 3 posts drafted" },
  { k: "Blocked", v: "SEO research \u2014 needs your decision on tooling" },
  { k: "Needs you", v: "1 pending approval · 1 hiring request" },
  { k: "Spend", v: "$14.20 this week" },
  { k: "Next week", v: "Onboarding redesign + market research brief" },
];

const faqs = [
  {
    q: "Is this another chatbot?",
    a: "No. A chatbot waits for prompts. ORQ8 is an organization: an Executive Agent plans, hires specialists, coordinates the work, and reports back. You steer it like a CEO, not type at it like a search bar.",
  },
  {
    q: "What can the agents actually do?",
    a: "Research, writing, code, analysis, planning, and coordination \u2014 with real tools, real files, and real output. Agents form departments, join projects, and work together on goals you set.",
  },
  {
    q: "How do I stay in control?",
    a: "Every employee has an explicit authority profile: what it can do, what it can spend, what requires your approval, what is forbidden. Consequential actions always come to you. You can pause anyone, or everything, instantly.",
  },
  {
    q: "Can I bring my own keys or self-host?",
    a: "Yes. BYOK is built in \u2014 connect your own model providers and keep costs at cost. The full stack is self-hostable with the free local version, and we never take a cut of agent work.",
  },
];

export default function Page() {
  return (
    <div id="main" className="min-h-screen bg-navy-950 text-white">
      {/* 01. HERO: the command center opens */}
      <div className="bg-mesh grain relative">
        <SiteHeader variant="navy" cta={{ href: "#start", label: "Start free" }} />
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pb-32 lg:pt-20">
            <div>
              <Reveal>
                <p className="eyebrow text-emerald">ORQ8: AI organization operating system</p>
                <h1 className="mt-6 text-6xl font-semibold tracking-[-0.03em] text-white sm:text-7xl lg:text-8xl">
                  ORQ8<span className="text-emerald">.</span>
                </h1>
                <p className="mt-4 text-2xl font-medium tracking-tight text-white text-balance sm:text-3xl">
                  Run your company with AI employees.
                </p>
                <p className="mt-6 max-w-lg text-base leading-relaxed text-fog sm:text-lg">
                  You set the direction. ORQ8 hires the team, does the work, and reports back under
                  your approvals and your budget.
                </p>
              </Reveal>
              <Reveal delay={100} className="mt-10">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <a href="#start" className={primaryCta}>
                    Start your company free
                  </a>
                  <a href="#how-it-works" className={ghostCta}>
                    See how it works <span aria-hidden>→</span>
                  </a>
                </div>
                <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
                  Free to start · No credit card · Self-hostable
                </p>
              </Reveal>
            </div>
            <Reveal delay={150}>
              <CommandCenter />
            </Reveal>
          </div>
        </section>
      </div>

      {/* 02. STACK STRIP: the ecosystem it plugs into */}
      <section className="border-y border-white/8 bg-navy-900">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Reveal>
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">
              Plugs into the tools you already run
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              {["Slack", "Gmail", "GitHub", "Notion", "Linear", "Stripe", "Zapier", "Docs"].map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald" aria-hidden />
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 03. HOW IT WORKS */}
      <section id="how-it-works" className="bg-navy-950 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow index="01" text="How it works" />
            <h2 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-5xl">
              Tell ORQ8 what you want.{" "}
              <span className="text-emerald">It builds the organization to do it.</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="border-t border-white/12 pt-6">
                  <p className="font-mono text-sm text-emerald">{s.n}</p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">{s.t}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-fog">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-14">
            <a href="#features" className={`${textCta} group-hover:gap-3`}>
              See the work they do <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
          </Reveal>
        </div>
      </section>

      {/* 04. FEATURES BENTO */}
      <section id="features" className="bg-navy-900 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow index="02" text="The platform" />
            <h2 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-5xl">
              An operating system, <span className="text-emerald">not a chatbot.</span>
            </h2>
          </Reveal>

          <Reveal delay={80} className="mt-14">
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="rounded-2xl border border-emerald/25 bg-navy-surface p-6 sm:p-8 lg:col-span-3">
                <div className="grid items-center gap-8 lg:grid-cols-2">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">Flagship · Governance</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                      Governance from the first node.
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-fog">
                      You are node 001. Every agent below you inherits authority from your Constitution.
                      what it can do, what it can spend, what it must ask about. The tree grows, the rules hold.
                    </p>
                    <ul className="mt-6 space-y-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">
                      <li className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-emerald" aria-hidden /> You · CEO · node 001
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-emerald" aria-hidden /> Authority inherited, not guessed
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-emerald" aria-hidden /> Node count extends as work requires
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-navy-950/60 p-4">
                    <MiniOrg />
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-navy-surface p-6 sm:p-8 lg:col-span-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">The weekly report</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                    Every Monday, your company reports to you.
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-fog">
                    What happened. What&apos;s working. What&apos;s blocked. What needs you. What it cost.
                    What&apos;s next. Five minutes to read.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                  {["Happened", "Blocked", "Needs you", "Cost", "Next", "Risk"].map((k) => (
                    <span key={k} className="rounded-lg border border-white/8 bg-navy-950/60 px-2 py-2 text-center">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.tag} delay={(i % 3) * 70}>
                <div className="group h-full rounded-2xl border border-white/10 bg-navy-surface p-6 transition-colors duration-300 hover:border-emerald/40">
                  <FeatureIcon name={f.icon} className="h-5 w-5 text-emerald" />
                  <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">{f.tag}</p>
                  <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fog">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-14">
            <a href="#organization" className={textCta}>
              Your team, hired on demand <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
          </Reveal>
        </div>
      </section>

      {/* 05. THE ORGANIZATION: the tree grows */}
      <section id="organization" className="bg-navy-950 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <Reveal className="text-center">
            <Eyebrow index="03" text="The organization" />
            <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-5xl">
              One CEO. An organization that{" "}
              <span className="text-emerald">grows around you.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl leading-relaxed text-fog">
              Start with one Executive Agent and a goal. Hire specialists when the work demands them.
              a researcher, an engineer, a writer, an analyst. They form departments. They join teams.
              They report to you.
            </p>
          </Reveal>
          <Reveal className="mt-14" delay={100}>
            <div className="rounded-2xl border border-white/10 bg-navy-surface p-6 sm:p-10">
              <GrowthTree tone="dark" />
            </div>
          </Reveal>
          <Reveal className="mt-10 text-center">
            <p className="text-lg font-medium text-white">
              Three agents today. <span className="text-emerald">Thirty next quarter.</span> The structure adapts.
            </p>
          </Reveal>
          <Reveal className="mt-10 text-center">
            <a href="#start" className={primaryCta}>
              Hire your first specialist
            </a>
          </Reveal>
        </div>
      </section>

      {/* 06. CONTROL: the trust story */}
      <section id="control" className="bg-navy-900 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <Eyebrow index="04" text="Control" />
            <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-5xl">
              AI does the work.{" "}
              <span className="text-emerald">You make the decisions.</span>
            </h2>
            <p className="mt-6 leading-relaxed text-fog">
              Every employee has an explicit authority profile. What they can do. What they can spend.
              What requires your approval. What is forbidden.
            </p>
            <ul className="mt-10 space-y-6">
              {pillars.map((p) => (
                <li key={p.t} className="border-l-2 border-emerald/50 pl-4">
                  <p className="text-lg font-semibold text-white">{p.t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-fog">{p.d}</p>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div
              className="w-full rounded-2xl border border-white/12 bg-navy-surface p-6 sm:p-8"
              role="img"
              aria-label="Approval card mockup: Marketing requests $250 for a LinkedIn campaign, awaiting your approval"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald/50 text-sm font-semibold text-emerald">
                  !
                </span>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald">Approval required</p>
              </div>
              <p className="mt-6 text-lg leading-relaxed text-white">
                Marketing requests <span className="font-semibold text-emerald">$250</span> for a LinkedIn
                campaign targeting Series A founders.
              </p>
              <div className="mt-6 space-y-1.5 font-mono text-xs text-fog">
                <p>Projected reach: 12,000 · Expected CPL: $4.20</p>
                <p>Budget remaining: $1,180 / $2,000</p>
              </div>
              <div className="mt-6 border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-fog">
                Recommended by: Executive Agent · Risk: Low · Reversible
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="flex h-10 flex-1 items-center justify-center rounded-full bg-emerald px-4 text-sm font-semibold text-navy-950">
                  Approve
                </span>
                <span className="flex h-10 flex-1 items-center justify-center rounded-full border border-white/20 px-4 text-sm text-white/80">
                  Reject
                </span>
                <span className="flex h-10 flex-1 items-center justify-center rounded-full border border-white/20 px-4 text-sm text-white/80">
                  Modify
                </span>
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal className="mx-auto mt-20 max-w-3xl px-6 text-center">
          <p className="text-2xl font-medium text-white">This is not a chatbot with guardrails.</p>
          <p className="mt-3 text-3xl font-semibold text-emerald sm:text-4xl">
            This is an organization with governance.
          </p>
          <div className="mt-10">
            <a href="#start" className={outlineCta}>
              Start with a Constitution
            </a>
          </div>
        </Reveal>
      </section>

      {/* 07. THE WEEKLY REPORT */}
      <section className="bg-navy-950 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <Eyebrow index="05" text="The company reports back" />
            <h2 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-5xl">
              Every Monday, your company{" "}
              <span className="text-emerald">reports to you.</span>
            </h2>
            <p className="mt-6 text-lg text-white">One report. Five minutes to read.</p>
            <ul className="mt-9 grid gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-fog sm:grid-cols-2">
              <li>What happened.</li>
              <li>What&apos;s working.</li>
              <li>What&apos;s blocked.</li>
              <li>What needs you.</li>
              <li>What it cost.</li>
              <li>What&apos;s next.</li>
            </ul>
            <p className="mt-10 text-lg leading-relaxed text-fog">
              You don&apos;t manage every task.{" "}
              <span className="font-medium text-white">You manage the company.</span>
            </p>
            <div className="mt-8">
              <a href="#start" className={textCta}>
                Get your first Monday report <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </a>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div
              className="rounded-2xl border border-white/12 bg-navy-surface p-6 sm:p-8"
              role="img"
              aria-label="Weekly report mockup for August 11 through 17: goals, completed, blocked, needs you, spend, next week"
            >
              <div className="flex items-baseline justify-between border-b border-white/10 pb-4">
                <p className="text-xl font-semibold text-white">Weekly Report</p>
                <p className="font-mono text-xs text-fog">Aug 11–17</p>
              </div>
              <div className="mt-6 space-y-5 text-sm">
                {reportRows.map((row) => (
                  <div key={row.k} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />
                    <p>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog">{row.k}</span>
                      <span className="ml-2 text-white/90">{row.v}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 08. PRICING TEASER */}
      <section className="bg-navy-900 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="text-center">
            <Eyebrow index="06" text="Pricing" />
            <h2 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-5xl">
              Free to start. <span className="text-emerald">$49 when it earns its keep.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-fog">
              No credit card to begin. Bring your own model keys and pay exactly what the work costs.
            </p>
          </Reveal>
          <div className="mx-auto mt-14 grid max-w-3xl gap-5 sm:grid-cols-2">
            <Reveal delay={60}>
              <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-navy-surface p-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Free</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-white">
                  $0
                  <span className="text-base font-normal text-fog"> /mo</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-fog">
                  <li>Your first 3 agents</li>
                  <li>1 department</li>
                  <li>Approvals + audit trail</li>
                  <li>Community support</li>
                </ul>
                <a href="#start" className={`${ghostCta} mt-8 w-full`}>
                  Start free
                </a>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="relative flex h-full flex-col rounded-2xl border border-emerald/40 bg-navy-surface p-7">
                <span className="absolute -top-3 left-7 rounded-full bg-emerald px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-navy-950">
                  Most popular
                </span>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">Pro</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-white">
                  $49
                  <span className="text-base font-normal text-fog"> /mo</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-fog">
                  <li>Unlimited agents</li>
                  <li>All departments + teams</li>
                  <li>Budgets + company Constitution</li>
                  <li>BYOK: bring your own keys</li>
                </ul>
                <a href="#start" className={`${primaryCta} mt-8 w-full`}>
                  Start Pro
                </a>
              </div>
            </Reveal>
          </div>
          <Reveal className="mt-10 text-center">
            <a href="/pricing" className={`${textCta} justify-center`}>
              See full pricing <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">
              Enterprise & self-host on request
            </p>
          </Reveal>
        </div>
      </section>

      {/* 09. FAQ */}
      <section className="bg-navy-950 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <Eyebrow index="07" text="Questions" />
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Before you ask.
            </h2>
          </Reveal>
          <Reveal className="mt-10" delay={80}>
            <div>
              {faqs.map((f) => (
                <details key={f.q} className="group border-b border-white/10 py-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-white [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="font-mono text-lg text-emerald transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fog">{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section
        id="start"
        className="bg-mesh grain relative overflow-hidden py-28 sm:py-36"
        style={{ "--mesh-accent": "rgb(52 211 153 / 0.24)" } as CSSProperties}
      >
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <Reveal>
            <p className="eyebrow text-emerald">ORQ8</p>
            <h2 className="mt-7 text-4xl font-semibold leading-tight tracking-tight text-white text-balance sm:text-6xl">
              Your company,{" "}
              <span className="text-emerald">one decision away.</span>
            </h2>
            <p className="mt-7 text-lg leading-relaxed text-fog">
              You don&apos;t have to do everything yourself. Tell ORQ8 what you want, and build the
              organization that works with you.
            </p>
          </Reveal>
          <Reveal delay={120} className="mx-auto mt-10 max-w-md">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-white/50">
              Join the waitlist. First cohort opens soon
            </p>
            <WaitlistForm variant="dark" />
          </Reveal>
          <Reveal delay={200} className="mt-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-emerald">You&apos;re the CEO.</p>
          </Reveal>
        </div>
      </section>

      <SiteFooter variant="dark" />
    </div>
  );
}
