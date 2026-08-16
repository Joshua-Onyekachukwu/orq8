"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";

/**
 * Agent Activity Log: every action an agent takes lands here in plain
 * language, with the reason attached (the "because" the CEO never has to
 * chase). Filters are client-side over sample data until the Phase 2 event
 * store lands (docs/49, R-EVT-1).
 */
type ActivityEvent = {
  id: number;
  time: string;
  agent: string;
  dept: "Marketing" | "Engineering" | "Operations";
  type: "Analyzed" | "Drafted" | "Reviewed" | "Deployed" | "Approved" | "Rejected" | "Filed";
  summary: string;
  because: string;
  cost: string;
};

const events: ActivityEvent[] = [
  {
    id: 1,
    time: "09:41",
    agent: "Researcher · α",
    dept: "Marketing",
    type: "Analyzed",
    summary: "Read 42 competitor pricing pages and updated the market map",
    because: "Marketing needs pricing intel to finish the launch post",
    cost: "$0.42",
  },
  {
    id: 2,
    time: "09:12",
    agent: "Writer · α",
    dept: "Marketing",
    type: "Drafted",
    summary: "Drafted Launch post v2 and sent it for approval",
    because: "The LinkedIn campaign needs a first draft before the designer touches it",
    cost: "$0.18",
  },
  {
    id: 3,
    time: "08:47",
    agent: "Engineer · α",
    dept: "Engineering",
    type: "Reviewed",
    summary: "Opened PR #142 and marked it ready for review",
    because: "The deployment pipeline change is verified and ready to ship",
    cost: "$0.09",
  },
  {
    id: 4,
    time: "08:20",
    agent: "Researcher · α",
    dept: "Marketing",
    type: "Filed",
    summary: "Logged 6 new competitor mentions into company memory",
    because: "The weekly report asks for a competitive snapshot",
    cost: "$0.06",
  },
  {
    id: 5,
    time: "07:58",
    agent: "Engineer · α",
    dept: "Engineering",
    type: "Deployed",
    summary: "Shipped the staging environment config to preview",
    because: "QA needs a live URL to test the pricing page changes",
    cost: "$0.11",
  },
  {
    id: 6,
    time: "07:31",
    agent: "Writer · α",
    dept: "Marketing",
    type: "Drafted",
    summary: "Wrote the onboarding email sequence, step 1 of 4",
    because: "New signups should hear from ORQ8 within a day of joining",
    cost: "$0.14",
  },
  {
    id: 7,
    time: "07:05",
    agent: "Researcher · α",
    dept: "Operations",
    type: "Analyzed",
    summary: "Compared 3 support tool vendors against our checklist",
    because: "The operations plan lists tooling as an open decision",
    cost: "$0.37",
  },
];

const agents = ["All agents", ...new Set(events.map((e) => e.agent))];
const departments = ["All departments", ...new Set(events.map((e) => e.dept))];
const types = ["All actions", ...new Set(events.map((e) => e.type))];

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-navy-800 sm:w-auto"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export default function ActivityPage() {
  const [agent, setAgent] = useState("All agents");
  const [dept, setDept] = useState("All departments");
  const [type, setType] = useState("All actions");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (agent === "All agents" || e.agent === agent) &&
          (dept === "All departments" || e.dept === dept) &&
          (type === "All actions" || e.type === type) &&
          (query.trim() === "" ||
            e.summary.toLowerCase().includes(query.toLowerCase()) ||
            e.because.toLowerCase().includes(query.toLowerCase()))
      ),
    [agent, dept, type, query]
  );

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
          Live log · every action, with the reason
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Agent Activity
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every action an agent takes, in plain language, with the &ldquo;because&rdquo;
          attached. Nothing happens in your company that you can&apos;t trace.
        </p>
      </header>

      {/* Filters */}
      <section aria-label="Filters" className="mt-6 rounded-xl border border-hairline bg-white p-4 sm:p-5">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          <Filter className="h-3.5 w-3.5" /> Filters
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Agent" value={agent} options={agents} onChange={setAgent} />
          <Select label="Department" value={dept} options={departments} onChange={setDept} />
          <Select label="Action type" value={type} options={types} onChange={setType} />
          <label className="block">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Search
            </span>
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an action or reason"
                className="w-full rounded-lg border border-hairline bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-navy-800"
              />
            </span>
          </label>
        </div>
      </section>

      {/* Timeline */}
      <section aria-label="Activity timeline" className="mt-6">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
            <p className="text-sm font-medium text-ink">Nothing matches those filters</p>
            <p className="mt-1 text-sm text-muted">
              Try widening the agent, department, or action type.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {filtered.map((e) => (
              <li key={e.id} className="rounded-xl border border-hairline bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <time className="font-mono text-xs tabular-nums text-muted">{e.time}</time>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                      e.type === "Deployed" || e.type === "Approved"
                        ? "bg-emerald/15 text-emerald-700"
                        : e.type === "Rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-indigo-50 text-indigo-700"
                    }`}
                  >
                    {e.type}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                    {e.dept}
                  </span>
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
                    {e.cost}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink">
                  <span className="font-semibold">{e.agent}</span>{" "}
                  {e.summary}
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                  <span aria-hidden className="mt-0.5 font-mono font-semibold text-emerald">
                    because
                  </span>
                  {e.because}
                </p>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-muted">
          Sample log · the live event store lands in Phase 2
        </p>
      </section>
    </div>
  );
}
