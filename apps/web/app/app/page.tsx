import Link from "next/link";
import { ArrowUpRight, Check, PencilLine, Plus, UserPlus, X } from "lucide-react";

export const metadata = { title: "Dashboard" };

// Sample data: the API endpoints behind these surfaces land in Phase 2–3
// (docs/49). The dashboard is the CEO's daily screen: decisions first, then
// the live status of the company.
const approvals = [
  {
    id: 1,
    from: "Marketing specialist",
    what: "requests $250 for a LinkedIn launch campaign",
    context: "Within budget · Dept allocation 62% used",
  },
  {
    id: 2,
    from: "Engineer · α",
    what: "wants to deploy PR #142 to production",
    context: "3 reviewers passed · Staging verified",
  },
];

const agents = [
  { name: "Researcher · α", doing: "Analyzing market data", dept: "Marketing" },
  { name: "Writer · α", doing: "Drafting launch post", dept: "Marketing" },
  { name: "Engineer · α", doing: "Reviewing PR #142", dept: "Engineering" },
];

const budgets = [
  { dept: "Marketing", pct: 62 },
  { dept: "Engineering", pct: 47 },
  { dept: "Operations", pct: 18 },
];

const quickActions = [
  { label: "Give direction", href: "/app/report", note: "Tell the Executive Agent what's next" },
  { label: "Hire an agent", href: "/app/agents", note: "Pick a role template (Phase 2)" },
  { label: "Add a provider key", href: "/settings/providers", note: "BYOK · encrypted at rest" },
];

export default function AppPage() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
          {today}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Good morning, Founder
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your company is working. Here&apos;s what needs you today.
        </p>
      </header>

      {/* Live status strip */}
      <div className="mt-6 grid grid-cols-3 divide-x divide-hairline rounded-xl border border-hairline bg-white">
        {[
          { k: "Agents active", v: "03", note: "working now" },
          { k: "Tasks this week", v: "14", note: "12 done · 2 in review" },
          { k: "Weekly spend", v: "$14.20", note: "within budget" },
        ].map((s) => (
          <div key={s.k} className="px-4 py-4 sm:px-6 sm:py-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {s.k}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-navy-900 tabular-nums sm:text-3xl">
              {s.v}
            </p>
            <p className="mt-0.5 hidden text-xs text-muted sm:block">{s.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left column: decision center + quick actions */}
        <div className="space-y-6">
          {/* Approval queue */}
          <section aria-labelledby="approvals-heading" className="rounded-xl border border-hairline bg-white">
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
            <div className="divide-y divide-hairline">
              {approvals.map((a) => (
                <div key={a.id} className="px-5 py-4">
                  <p className="text-sm leading-relaxed text-ink">
                    <span className="font-semibold">{a.from}</span> {a.what}
                  </p>
                  <p className="mt-1 text-xs text-muted">{a.context}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald px-3.5 py-1.5 text-xs font-semibold text-navy-950 transition-colors hover:bg-lime"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-navy-800"
                    >
                      <PencilLine className="h-3.5 w-3.5" /> Modify
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-300 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="border-t border-hairline bg-canvas px-5 py-3 font-mono text-[10px] uppercase tracking-wide text-muted">
              Sample queue · approval engine lands in Phase 3–5
            </p>
          </section>

          {/* Quick actions */}
          <section aria-labelledby="quick-heading" className="rounded-xl border border-hairline bg-white">
            <div className="border-b border-hairline px-5 py-4">
              <h2 id="quick-heading" className="text-sm font-semibold text-ink">
                Quick actions
              </h2>
            </div>
            <div className="grid gap-px bg-hairline sm:grid-cols-3">
              {quickActions.map((qa) => (
                <Link
                  key={qa.label}
                  href={qa.href}
                  className="group flex flex-col bg-white p-5 transition-colors hover:bg-canvas"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-emerald transition-colors group-hover:bg-lime group-hover:text-navy-950">
                    {qa.label === "Give direction" ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : qa.label === "Hire an agent" ? (
                      <UserPlus className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                  <span className="mt-3 text-sm font-semibold text-ink">{qa.label}</span>
                  <span className="mt-1 text-xs leading-relaxed text-muted">{qa.note}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Right column: live agents + report + budget */}
        <div className="space-y-6">
          {/* Active agents */}
          <section aria-labelledby="agents-heading" className="rounded-xl border border-hairline bg-white">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h2 id="agents-heading" className="text-sm font-semibold text-ink">
                Active now
              </h2>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" /> Live
              </span>
            </div>
            <ul className="divide-y divide-hairline">
              {agents.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.doing}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                    {a.dept}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-hairline bg-canvas px-5 py-3">
              <Link
                href="/app/activity"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
              >
                See agent activity →
              </Link>
            </div>
          </section>

          {/* Monday report */}
          <section className="rounded-xl border border-navy-800 bg-navy-950 p-5 text-white">
            <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> Monday report
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">The week in one page</h2>
            <p className="mt-1 text-sm leading-relaxed text-white/70">
              What happened, what&apos;s blocked, what it cost, what&apos;s next. Five
              minutes to read, every Monday.
            </p>
            <Link
              href="/app/report"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald px-4 py-2 text-xs font-semibold text-navy-950 transition-colors hover:bg-lime"
            >
              Read the report <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </section>

          {/* Budgets */}
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
            <div className="mt-4 space-y-3.5">
              {budgets.map((b) => (
                <div key={b.dept}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{b.dept}</span>
                    <span className="text-muted">{b.pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-emerald" style={{ width: `${b.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
