import { Activity, ArrowDownRight, ArrowUpRight, CircleDollarSign, ClipboardCheck, ListChecks, TrendingUp, Wallet } from "lucide-react";

export const metadata = { title: "Widgets" };

/**
 * Widgets, adapted from the Trezo widget base: the reusable stat cards and
 * mini-panels that compose dashboards.
 */
const stats = [
  {
    label: "Weekly spend",
    value: "$14.20",
    delta: "+8% vs last week",
    up: true,
    icon: CircleDollarSign,
    accent: "bg-emerald/10 text-emerald-700",
  },
  {
    label: "Approval rate",
    value: "94%",
    delta: "+2% this month",
    up: true,
    icon: ClipboardCheck,
    accent: "bg-indigo-50 text-indigo-700",
  },
  {
    label: "Tasks this week",
    value: "14",
    delta: "12 done · 2 in review",
    up: false,
    icon: ListChecks,
    accent: "bg-amber-50 text-amber-700",
  },
  {
    label: "Budget used",
    value: "42%",
    delta: "within limits",
    up: false,
    icon: Wallet,
    accent: "bg-red-50 text-red-600",
  },
];

const agents = [
  { name: "Researcher · α", role: "Market researcher", status: "Working" },
  { name: "Writer · α", role: "Content writer", status: "Working" },
  { name: "Engineer · α", role: "Software engineer", status: "Working" },
  { name: "Analyst · α", role: "Operations analyst", status: "Paused" },
];

const deptSpend = [
  { dept: "Marketing", spent: "$620", pct: 62 },
  { dept: "Engineering", spent: "$470", pct: 47 },
  { dept: "Operations", spent: "$180", pct: 18 },
];

const weekPlan = [
  { day: "Mon", item: "Approve the launch campaign budget" },
  { day: "Tue", item: "Review pricing page v2 with Engineer · α" },
  { day: "Wed", item: "Read the competitor pricing intel" },
  { day: "Thu", item: "Decide on the support tooling vendor" },
  { day: "Fri", item: "Weekly report: what happened, what's next" },
];

export default function WidgetsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
          UI Kit · Widgets
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Widgets</h1>
        <p className="mt-1 text-sm text-muted">
          The reusable stat cards and panels that compose every ORQ8 surface.
        </p>
      </header>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-hairline bg-white p-5">
            <div className="flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.accent}`}>
                <s.icon className="h-5 w-5" />
              </span>
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                  s.up ? "bg-emerald/10 text-emerald-700" : "bg-canvas text-muted"
                }`}
              >
                {s.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {s.delta}
              </span>
            </div>
            <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-900 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Agents widget */}
        <section className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Agents</h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" /> 3 working
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {agents.map((a) => (
              <li key={a.name} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                  {a.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.role}</p>
                </div>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${a.status === "Working" ? "bg-emerald" : "bg-muted"}`}
                  title={a.status}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Top performer */}
        <section className="rounded-xl border border-navy-800 bg-navy-950 p-5 text-white">
          <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
            <TrendingUp className="h-3.5 w-3.5" /> Top performer
          </p>
          <div className="mt-5 flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lime text-xl font-bold text-navy-950">
              R
            </span>
            <div>
              <p className="text-base font-semibold">Researcher · α</p>
              <p className="text-sm text-white/60">Market researcher</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-white/10">
            {[
              { k: "Tasks", v: "41" },
              { k: "Cost", v: "$3.20" },
              { k: "Rating", v: "92%" },
            ].map((x) => (
              <div key={x.k} className="bg-navy-950 px-3 py-2.5 text-center">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-wide text-white/40">{x.k}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">{x.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-white/60">
            <Activity className="h-3.5 w-3.5" /> Highest output at the lowest cost this week
          </p>
        </section>

        {/* Dept spend */}
        <section className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Dept spend</h2>
          <div className="mt-4 space-y-4">
            {deptSpend.map((d) => (
              <div key={d.dept}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">{d.dept}</span>
                  <span className="font-mono tabular-nums text-muted">
                    {d.spent} · {d.pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div
                    className={`h-full rounded-full ${d.pct >= 60 ? "bg-amber-400" : "bg-emerald"}`}
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 flex items-center justify-between border-t border-hairline pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Weekly total <span className="text-emerald-700">$1,270 / $3,000</span>
          </p>
        </section>
      </div>

      {/* Week plan widget */}
      <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">This week&apos;s plan</h2>
        <ul className="mt-4 grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-5">
          {weekPlan.map((d) => (
            <li key={d.day} className="bg-white p-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
                {d.day}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{d.item}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
