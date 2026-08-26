import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  ListChecks,
  PencilLine,
  Users,
  X,
} from "lucide-react";

export const metadata = { title: "Dashboard" };

// Sample data: the API endpoints behind these surfaces land in Phase 2–3
// (docs/49). The dashboard follows the Trezo grid base: a welcome banner, a
// stat-card row, then decision tables and spend panels below.
const stats = [
  {
    label: "Agents active",
    value: "03",
    note: "working right now",
    icon: Users,
    accent: "bg-emerald/10 text-emerald-700",
  },
  {
    label: "Tasks this week",
    value: "14",
    note: "12 done · 2 in review",
    icon: ListChecks,
    accent: "bg-indigo-50 text-indigo-700",
  },
  {
    label: "Weekly spend",
    value: "$14.20",
    note: "within budget",
    icon: CircleDollarSign,
    accent: "bg-amber-50 text-amber-700",
  },
  {
    label: "Approvals pending",
    value: "02",
    note: "need your sign-off",
    icon: ClipboardCheck,
    accent: "bg-red-50 text-red-600",
  },
];

const weekActivity = [
  { day: "Mon", actions: 9 },
  { day: "Tue", actions: 14 },
  { day: "Wed", actions: 11 },
  { day: "Thu", actions: 17 },
  { day: "Fri", actions: 8 },
  { day: "Sat", actions: 3 },
  { day: "Sun", actions: 6 },
];

const approvals = [
  {
    id: "#RQ-1042",
    from: "Marketing specialist",
    what: "requests $250 for a LinkedIn launch campaign",
    cost: "$250",
    status: "Awaiting",
  },
  {
    id: "#RQ-1041",
    from: "Engineer · α",
    what: "wants to deploy PR #142 to production",
    cost: "$0",
    status: "Awaiting",
  },
  {
    id: "#RQ-1040",
    from: "Writer · α",
    what: "publishes Launch post v2 to the blog",
    cost: "$0",
    status: "Approved",
  },
  {
    id: "#RQ-1039",
    from: "Researcher · α",
    what: "buys access to the pricing survey dataset",
    cost: "$40",
    status: "Rejected",
  },
];

const budgets = [
  { dept: "Marketing", spent: "$620", total: "$1,000", pct: 62 },
  { dept: "Engineering", spent: "$470", total: "$1,000", pct: 47 },
  { dept: "Operations", spent: "$180", total: "$1,000", pct: 18 },
];

const recentActions = [
  {
    time: "09:41",
    agent: "Researcher · α",
    summary: "Read 42 competitor pricing pages and updated the market map",
    because: "Marketing needs pricing intel for the launch post",
    cost: "$0.42",
  },
  {
    time: "09:12",
    agent: "Writer · α",
    summary: "Drafted Launch post v2 and sent it for approval",
    because: "The LinkedIn campaign needs a first draft",
    cost: "$0.18",
  },
  {
    time: "08:47",
    agent: "Engineer · α",
    summary: "Opened PR #142 and marked it ready for review",
    because: "The deployment pipeline change is verified",
    cost: "$0.09",
  },
  {
    time: "08:20",
    agent: "Researcher · α",
    summary: "Logged 6 new competitor mentions into company memory",
    because: "The weekly report asks for a competitive snapshot",
    cost: "$0.06",
  },
  {
    time: "07:31",
    agent: "Writer · α",
    summary: "Wrote the onboarding email sequence, step 1 of 4",
    because: "New signups should hear from ORQ8 within a day",
    cost: "$0.14",
  },
];

export default function AppPage() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const maxActions = Math.max(...weekActivity.map((d) => d.actions));

  return (
    <div className="mx-auto max-w-6xl">
      {/* Row 1: Welcome banner */}
      <div className="rounded-xl bg-navy-950 p-6 text-white sm:p-8">
        <div className="relative md:pr-[240px]">
          <div className="md:py-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
              {today}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Good morning, Founder
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Here&apos;s what&apos;s happening in your company today.
            </p>

            <div className="mt-6 border-t border-white/10 pb-6 pt-6 sm:flex sm:items-center sm:gap-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime text-navy-950">
                  <ClipboardCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">2 Approvals waiting</p>
                  <p className="text-xs text-white/60">Need your sign-off</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 sm:mt-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald text-navy-950">
                  <Activity className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">3 Agents working</p>
                  <p className="text-xs text-white/60">Across 2 departments</p>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative system status */}
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-center md:absolute md:right-0 md:top-1/2 md:mt-0 md:w-[210px] md:-translate-y-1/2">
            <p className="flex items-center justify-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-lime">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
              System online
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">
              ORQ8
            </p>
            <p className="mt-1 text-xs text-white/60">Company of One</p>
          </div>
        </div>
      </div>

      {/* Row 2: Stat cards + weekly activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-hairline bg-white p-4 sm:p-5"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.accent}`}
                >
                  <s.icon className="h-4 w-4" />
                </span>
                <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {s.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-900 tabular-nums">
                  {s.value}
                </p>
                <p className="mt-0.5 text-xs text-muted">{s.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly activity chart (CSS bars, no chart dependency) */}
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Agent activity</h2>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
              This week
            </span>
          </div>
          <div className="mt-5 flex h-36 items-end justify-between gap-2">
            {weekActivity.map((d, i) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-28 w-full items-end">
                  <div
                    className={`w-full rounded-t-md transition-colors ${
                      i === new Date().getDay() % 7
                        ? "bg-lime"
                        : "bg-emerald/25 hover:bg-emerald/50"
                    }`}
                    style={{ height: `${Math.round((d.actions / maxActions) * 100)}%` }}
                    title={`${d.actions} agent actions`}
                  />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  {d.day}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted">
            <span className="font-medium text-ink">68 actions</span> this week ·
            every one traceable in the{" "}
            <Link href="/app/activity" className="font-medium text-navy-800 hover:text-emerald">
              activity log
            </Link>
          </p>
        </div>
      </div>

      {/* Row 3: Decision center + budgets */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Decision Center */}
        <section
          aria-labelledby="approvals-heading"
          className="rounded-xl border border-hairline bg-white lg:col-span-2"
        >
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2 id="approvals-heading" className="text-sm font-semibold text-ink">
              Decision Center
            </h2>
            <Link
              href="/app/approvals"
              className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
            >
              All requests <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Request", "What", "Cost", "Status", "Action"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {approvals.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-muted">
                      {a.id}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-ink">
                        <span className="font-semibold">{a.from}</span> {a.what}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                      {a.cost}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                          a.status === "Approved"
                            ? "bg-emerald/15 text-emerald-700"
                            : a.status === "Rejected"
                              ? "bg-red-100 text-red-600"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {a.status === "Awaiting" ? (
                          <>
                            <button
                              type="button"
                              title="Approve"
                              aria-label="Approve"
                              className="rounded-lg border border-hairline p-1.5 text-emerald-700 transition-colors hover:border-emerald hover:bg-emerald hover:text-navy-950"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Modify"
                              aria-label="Modify"
                              className="rounded-lg border border-hairline p-1.5 text-navy-800 transition-colors hover:border-navy-800"
                            >
                              <PencilLine className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Reject"
                              aria-label="Reject"
                              className="rounded-lg border border-hairline p-1.5 text-muted transition-colors hover:border-red-300 hover:text-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-hairline bg-canvas px-5 py-3 font-mono text-[10px] uppercase tracking-wide text-muted">
            Sample queue · approval engine lands in Phase 3–5
          </p>
        </section>

        {/* Dept budgets */}
        <section aria-labelledby="budget-heading" className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 id="budget-heading" className="text-sm font-semibold text-ink">
              Dept budgets
            </h2>
            <Link
              href="/app/budgets"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
            >
              Manage
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {budgets.map((b) => (
              <div key={b.dept}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">{b.dept}</span>
                  <span className="font-mono tabular-nums text-muted">
                    {b.spent} / {b.total}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div
                    className={`h-full rounded-full ${b.pct >= 60 ? "bg-amber-400" : "bg-emerald"}`}
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg bg-canvas p-3.5">
            <p className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Weekly total <span className="text-emerald-700">$1,270 / $3,000</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              42% used · hard caps pause work before overspend (Phase 2)
            </p>
          </div>
        </section>
      </div>

      {/* Row 4: Recent agent actions */}
      <section
        aria-labelledby="recent-heading"
        className="mt-6 rounded-xl border border-hairline bg-white"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 id="recent-heading" className="text-sm font-semibold text-ink">
            Recent agent actions
          </h2>
          <Link
            href="/app/activity"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
          >
            Full log <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <ul className="divide-y divide-hairline">
          {recentActions.map((a, i) => (
            <li key={i} className="flex items-start gap-4 px-5 py-3.5">
              <time className="mt-0.5 w-11 shrink-0 font-mono text-xs tabular-nums text-muted">
                {a.time}
              </time>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{a.agent}</span> {a.summary}
                </p>
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted">
                  <span aria-hidden className="font-mono font-semibold text-emerald">
                    because
                  </span>
                  {a.because}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                {a.cost}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-hairline bg-canvas px-5 py-3 font-mono text-[10px] uppercase tracking-wide text-muted">
          Live log · the event store lands in Phase 2
        </p>
      </section>
    </div>
  );
}
