"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";

/**
 * Tables: a sortable, searchable, paginated projects table, and an agent
 * performance table with satisfaction bars.
 */
type Project = {
  id: string;
  name: string;
  owner: string;
  status: "In progress" | "In review" | "Planned";
  progress: number;
  due: string;
};

const projects: Project[] = [
  { id: "#P-01", name: "Launch campaign", owner: "Writer · α", status: "In progress", progress: 62, due: "Aug 22" },
  { id: "#P-02", name: "Pricing page v2", owner: "Engineer · α", status: "In review", progress: 88, due: "Aug 19" },
  { id: "#P-03", name: "Market map", owner: "Researcher · α", status: "In progress", progress: 45, due: "Aug 25" },
  { id: "#P-04", name: "Onboarding emails", owner: "Writer · α", status: "In progress", progress: 34, due: "Aug 28" },
  { id: "#P-05", name: "Support tooling eval", owner: "Analyst · α", status: "Planned", progress: 8, due: "Sep 01" },
  { id: "#P-06", name: "Competitor pricing intel", owner: "Researcher · α", status: "In review", progress: 90, due: "Aug 18" },
  { id: "#P-07", name: "Deploy pipeline v2", owner: "Engineer · α", status: "In progress", progress: 51, due: "Aug 26" },
  { id: "#P-08", name: "Q3 goals draft", owner: "Analyst · α", status: "Planned", progress: 12, due: "Sep 05" },
];

const agents = [
  { name: "Researcher · α", role: "Market researcher", tasks: 41, review: 3, cost: "$3.20", satisfaction: 92 },
  { name: "Writer · α", role: "Content writer", tasks: 28, review: 2, cost: "$2.60", satisfaction: 88 },
  { name: "Engineer · α", role: "Software engineer", tasks: 17, review: 4, cost: "$4.10", satisfaction: 95 },
  { name: "Analyst · α", role: "Operations analyst", tasks: 9, review: 1, cost: "$0.00", satisfaction: 76 },
];

type SortKey = "id" | "name" | "progress" | "due";

const rowsPerPage = 5;

export default function TablesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "id", dir: "asc" });

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.owner.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const rows = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? (
      <ArrowUpDown className="h-3 w-3 opacity-40" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
          UI Kit · Data tables
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Tables</h1>
        <p className="mt-1 text-sm text-muted">
          The table patterns: sortable columns, search, pagination, and
          progress indicators.
        </p>
      </header>

      {/* Sortable DataTable */}
      <section className="mt-6 rounded-xl border border-hairline bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Projects</h2>
          <label className="relative block w-full max-w-xs">
            <span className="sr-only">Search projects</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search projects or agents..."
              className="w-full rounded-lg border border-hairline bg-canvas py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas text-left">
                {[
                  { k: "id" as SortKey, label: "ID" },
                  { k: "name" as SortKey, label: "Project" },
                  { k: "name" as SortKey, label: "Owner" },
                  { k: "name" as SortKey, label: "Status" },
                  { k: "progress" as SortKey, label: "Progress" },
                  { k: "due" as SortKey, label: "Due" },
                ].map((h, i) => (
                  <th key={i} className="px-5 py-2.5">
                    {h.k === "name" && h.label === "Owner" ? (
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Owner
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSort(h.k)}
                        className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
                      >
                        {h.label} <SortIcon k={h.k} />
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-canvas/60">
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-muted">{p.id}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-ink">{p.name}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">{p.owner}</td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                        p.status === "In review"
                          ? "bg-amber-50 text-amber-700"
                          : p.status === "In progress"
                            ? "bg-emerald/15 text-emerald-700"
                            : "bg-canvas text-muted"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full bg-emerald" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">{p.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="text-sm text-muted">
            Showing {rows.length} of {sorted.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label="Previous page"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-900 text-xs font-semibold text-white">
              {safePage}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label="Next page"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Agent performance */}
      <section className="mt-6 rounded-xl border border-hairline bg-white">
        <div className="border-b border-hairline px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Agent performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas text-left">
                {["Agent", "Tasks done", "In review", "Weekly cost", "Satisfaction"].map((h) => (
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
              {agents.map((a) => (
                <tr key={a.name} className="transition-colors hover:bg-canvas/60">
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                        {a.name.charAt(0)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{a.name}</p>
                        <p className="text-xs text-muted">{a.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm tabular-nums text-ink">{a.tasks}</td>
                  <td className="px-5 py-3.5 text-sm tabular-nums text-muted">{a.review}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                    {a.cost}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                        <div
                          className={`h-full rounded-full ${a.satisfaction >= 90 ? "bg-emerald" : a.satisfaction >= 80 ? "bg-lime" : "bg-amber-400"}`}
                          style={{ width: `${a.satisfaction}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted">{a.satisfaction}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-hairline bg-canvas px-5 py-3 font-mono text-[10px] uppercase tracking-wide text-muted">
          Sample data · live metrics land with the Phase 2 event store
        </p>
      </section>
    </div>
  );
}
