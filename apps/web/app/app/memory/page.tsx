import { Brain } from "lucide-react";

export const metadata = { title: "Company Memory" };

export default function MemoryPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
          Knowledge
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Company Memory
        </h1>
        <p className="mt-1 text-sm text-muted">
          Facts, decisions, and lessons your organization learns over time.
        </p>
      </header>

      <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
        <Brain className="mx-auto h-10 w-10 text-muted/30" />
        <p className="mt-4 text-sm font-medium text-ink">Memory builds automatically</p>
        <p className="mt-1 text-sm text-muted max-w-md mx-auto">
          As your AI employees execute tasks and learn from outcomes, ORQ8 accumulates organizational memory.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto">
          {[
            { label: "Facts", count: 0 },
            { label: "Decisions", count: 0 },
            { label: "Lessons", count: 0 },
          ].map((cat) => (
            <div key={cat.label} className="rounded-lg border border-hairline bg-canvas p-3 text-center">
              <p className="text-lg font-semibold text-ink">{cat.count}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{cat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
