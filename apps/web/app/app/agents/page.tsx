import Link from "next/link";
import { MoreHorizontal, Pause, Play, UserPlus } from "lucide-react";

export const metadata = { title: "Agents" };

/**
 * Agents roster. Agents are hired within the organization when a business
 * need exists (ADR-021: no marketplace, no commissions). Hiring templates
 * and the hire flow land in Phase 2; this roster shows the org's current
 * agents with live status and cost.
 */
const agents = [
  {
    name: "Researcher · α",
    role: "Market researcher",
    dept: "Marketing",
    status: "active" as const,
    weeklyCost: "$3.20",
    tasksDone: 41,
    hired: "Day 1",
  },
  {
    name: "Writer · α",
    role: "Content writer",
    dept: "Marketing",
    status: "active" as const,
    weeklyCost: "$2.60",
    tasksDone: 28,
    hired: "Day 1",
  },
  {
    name: "Engineer · α",
    role: "Software engineer",
    dept: "Engineering",
    status: "active" as const,
    weeklyCost: "$4.10",
    tasksDone: 17,
    hired: "Day 1",
  },
  {
    name: "Analyst · α",
    role: "Operations analyst",
    dept: "Operations",
    status: "paused" as const,
    weeklyCost: "$0.00",
    tasksDone: 9,
    hired: "Day 1",
  },
];

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Organization · 4 agents
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Agents
          </h1>
          <p className="mt-1 text-sm text-muted">
            The team you hire to run the company. Agents are assigned to
            departments, teams, and projects with budgets you control.
          </p>
        </div>
        <Link
          href="/app/teams"
          className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
        >
          <UserPlus className="h-3.5 w-3.5" /> Hire an agent
        </Link>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {agents.map((a) => (
          <article
            key={a.name}
            className="rounded-xl border border-hairline bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                  {a.name.charAt(0)}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-ink">{a.name}</h2>
                  <p className="text-xs text-muted">{a.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={a.status === "active" ? `Pause ${a.name}` : `Resume ${a.name}`}
                  title={a.status === "active" ? "Pause" : "Resume"}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  {a.status === "active" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`More actions for ${a.name}`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide">
              {a.status === "active" ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
                  <span className="text-emerald-700">Working now</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                  <span className="text-muted">Paused</span>
                </>
              )}
            </p>

            <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
              <div className="bg-canvas px-3 py-2.5">
                <dt className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                  Dept
                </dt>
                <dd className="mt-0.5 truncate text-xs font-medium text-ink">{a.dept}</dd>
              </div>
              <div className="bg-canvas px-3 py-2.5">
                <dt className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                  Weekly cost
                </dt>
                <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">{a.weeklyCost}</dd>
              </div>
              <div className="bg-canvas px-3 py-2.5">
                <dt className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                  Tasks done
                </dt>
                <dd className="mt-0.5 text-xs font-medium tabular-nums text-ink">{a.tasksDone}</dd>
              </div>
            </dl>

            <p className="mt-3 text-xs text-muted">
              Hired {a.hired} · <span className="text-ink">{a.role}</span> template ·{" "}
              <Link href="/app/activity" className="font-medium text-navy-800 hover:text-emerald">
                view activity
              </Link>
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-navy-800 bg-navy-950 p-5 text-white">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> Hiring rules
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          You, or an authorized executive, hire agents when a business need
          exists. No marketplace, no commissions. Role templates arrive in
          Phase 2, and every hire follows your budget policies.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-white/40">
          Sample roster · hiring engine lands in Phase 2
        </p>
      </div>
    </div>
  );
}
