// Landing-hero product mockup: the CEO Home screen (handoff notes §1.3 item 1).
// Pure JSX + tokens — rendered, not a screenshot, so it stays sharp at any size.
const decisions = [
  { title: "Publish validation report", meta: "Research team · 3 evidence sources", action: "Review" },
  { title: "Approve $200 research budget", meta: "Below authority ceiling", action: "Review" },
];

const agents = [
  { name: "Market Researcher", task: "Competitor pricing scan", status: "running", color: "bg-emerald-500" },
  { name: "Finance Analyst", task: "Unit economics model", status: "blocked", color: "bg-amber-500" },
  { name: "Legal Researcher", task: "GDRP checklist", status: "done", color: "bg-navy-700" },
];

export function MockCeoHome() {
  return (
    <div className="relative mx-auto mt-14 max-w-5xl">
      {/* glow behind the window */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-navy-700/40 via-navy-700/10 to-amber-300/20 blur-2xl animate-glow"
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-navy-900/50">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-hairline bg-canvas px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-hairline" />
          <span className="h-2.5 w-2.5 rounded-full bg-hairline" />
          <span className="h-2.5 w-2.5 rounded-full bg-hairline" />
          <p className="mx-auto pr-14 text-xs font-medium text-muted">ORQ8 — CEO Home</p>
        </div>

        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Good morning, Ada.</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">
                What would you like me to handle?
              </h3>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              All systems nominal
            </span>
          </div>

          {/* input */}
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-hairline bg-canvas px-4 py-3.5">
            <p className="flex-1 text-sm text-muted">
              Paste an idea, a link, or a question — “I think there’s a business here. Investigate it.”
            </p>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-800 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4Z" />
              </svg>
            </span>
          </div>

          {/* three panels */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-hairline p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pending decisions</p>
              <div className="mt-3 space-y-2.5">
                {decisions.map((d) => (
                  <div key={d.title} className="rounded-lg bg-canvas p-3">
                    <p className="text-sm font-medium text-ink">{d.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{d.meta}</p>
                    <span className="mt-2 inline-block rounded-md border border-navy-800 px-2 py-0.5 text-xs font-medium text-navy-800">
                      {d.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-hairline p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Active agents</p>
              <div className="mt-3 space-y-2.5">
                {agents.map((a) => (
                  <div key={a.name} className="flex items-center gap-3 rounded-lg bg-canvas p-3">
                    <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${a.color}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                      <p className="truncate text-xs text-muted">{a.task}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-navy-900 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">This week</p>
              <p className="mt-3 text-2xl font-semibold">$12.40</p>
              <p className="text-xs text-white/60">model costs</p>
              <div className="mt-4 space-y-2 text-xs text-white/80">
                <p className="flex justify-between"><span>3 agents active</span><span className="text-white">—</span></p>
                <p className="flex justify-between"><span>Cheap model handled</span><span className="text-white">78%</span></p>
                <p className="flex justify-between"><span>0 approvals waiting</span><span className="text-white">✓</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating chips */}
      <div className="absolute -left-4 top-1/3 hidden animate-float items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur lg:flex">
        <span className="text-emerald-300">✓</span> Approval granted
      </div>
      <div className="absolute -right-6 top-1/2 hidden animate-float items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur [animation-delay:1.2s] lg:flex">
        <span className="text-amber-300">◈</span> Memory updated
      </div>
      <div className="absolute -bottom-4 left-1/2 hidden animate-float items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white backdrop-blur [animation-delay:2.1s] md:flex">
        <span className="text-white/70">▣</span> Weekly report ready
      </div>
    </div>
  );
}
