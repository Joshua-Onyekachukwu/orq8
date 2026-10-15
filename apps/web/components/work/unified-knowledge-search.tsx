"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Brain, FileText, History, Loader2, Search, X } from "lucide-react";

/**
 * Single search across the three knowledge stores (AUD-007).
 *
 * The graph has a server search (`/v1/knowledge/search`); files and memory
 * do not, so those two are listed (bounded: 200 files, 100 memories) and
 * matched client-side — the same filtering their own pages already do.
 * A store that fails to respond degrades to a named note instead of
 * failing the whole search or silently dropping its hits.
 */

interface GraphHit {
  entities: Array<{ id: string; type: string; name: string }>;
  relations: Array<{ id: string; fromName: string; toName: string; relationType: string }>;
  decisions: Array<{ id: string; title: string; outcome: string | null }>;
}

interface MemoryHit {
  id: string;
  category: string;
  content: string;
}

interface FileHit {
  id: string;
  name: string;
}

function headline(content: string): string {
  const first = content.split("\n")[0] ?? content;
  return first.length > 90 ? `${first.slice(0, 90)}…` : first;
}

export function UnifiedKnowledgeSearch() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranQuery, setRanQuery] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphHit | null>(null);
  const [memories, setMemories] = useState<MemoryHit[] | null>(null);
  const [files, setFiles] = useState<FileHit[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setGraph(null);
      setMemories(null);
      setFiles(null);
      setRanQuery(null);
      setSkipped([]);
      return;
    }
    setSearching(true);
    setError(null);
    const missed: string[] = [];
    try {
      const [graphRes, memoryRes, filesRes] = await Promise.all([
        fetch(`/api/knowledge?kind=search&query=${encodeURIComponent(q)}&limit=12`).catch(() => null),
        fetch(`/api/memory?limit=100`).catch(() => null),
        fetch(`/api/files`).catch(() => null),
      ]);

      if (graphRes && graphRes.ok) {
        const json = await graphRes.json().catch(() => null);
        setGraph(json?.data ?? { entities: [], relations: [], decisions: [] });
      } else {
        setGraph(null);
        missed.push("knowledge graph");
      }

      const needle = q.toLowerCase();
      if (memoryRes && memoryRes.ok) {
        const json = await memoryRes.json().catch(() => null);
        const all: MemoryHit[] = json?.data ?? [];
        setMemories(
          all
            .filter(
              (m) =>
                m.content.toLowerCase().includes(needle) ||
                m.category.toLowerCase().includes(needle),
            )
            .slice(0, 5),
        );
      } else {
        setMemories(null);
        missed.push("memory");
      }

      if (filesRes && filesRes.ok) {
        const json = await filesRes.json().catch(() => null);
        const all: FileHit[] = json?.data ?? [];
        setFiles(
          all.filter((f) => f.name.toLowerCase().includes(needle)).slice(0, 5),
        );
      } else {
        setFiles(null);
        missed.push("files");
      }

      setSkipped(missed);
      setRanQuery(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const clear = useCallback(() => {
    setQuery("");
    setGraph(null);
    setMemories(null);
    setFiles(null);
    setRanQuery(null);
    setSkipped([]);
    setError(null);
  }, []);

  const graphCount =
    (graph?.entities.length ?? 0) +
    (graph?.decisions.length ?? 0) +
    (graph?.relations.length ?? 0);
  const total =
    graphCount + (memories?.length ?? 0) + (files?.length ?? 0);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
            placeholder="Search knowledge, files and memory — e.g. “customer onboarding”"
            aria-label="Search knowledge, files and memory"
            className="w-full rounded-lg border border-hairline bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
        {ranQuery && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-muted/10"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-border-error bg-error-soft px-4 py-3 text-sm text-error-ink">
          {error}
        </div>
      )}

      {ranQuery && !searching && !error && (
        <div className="mt-3 rounded-xl border border-hairline bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="h-4 w-4" /> {total === 0 ? "Nothing found" : `${total} match${total === 1 ? "" : "es"}`} for “{ranQuery}”
          </h2>
          {skipped.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Could not check {skipped.join(" and ")} just now — those hits may be missing.
            </p>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Graph ({graphCount})
              </p>
              <ul className="mt-2 space-y-1.5">
                {!graph || graphCount === 0 ? (
                  <li className="text-sm text-muted">No matches</li>
                ) : (
                  <>
                    {graph.entities.map((e) => (
                      <li key={`e-${e.id}`} className="text-sm">
                        <span className="mr-1.5 rounded-full border border-hairline px-1.5 py-0.5 text-3xs font-medium text-muted">{e.type}</span>
                        {e.name}
                      </li>
                    ))}
                    {graph.decisions.map((d) => (
                      <li key={`d-${d.id}`} className="text-sm">{d.title}</li>
                    ))}
                    {graph.relations.map((r) => (
                      <li key={`r-${r.id}`} className="text-sm text-muted">
                        <span className="text-foreground">{r.fromName}</span>{" "}
                        <span className="text-xs italic">{r.relationType.replace(/_/g, " ")}</span>{" "}
                        <span className="text-foreground">{r.toName}</span>
                      </li>
                    ))}
                  </>
                )}
              </ul>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                <FileText className="h-3 w-3" /> Files ({files?.length ?? "?"})
              </p>
              <ul className="mt-2 space-y-1.5">
                {files === null ? (
                  <li className="text-sm text-muted">Not checked</li>
                ) : files.length === 0 ? (
                  <li className="text-sm text-muted">No matches</li>
                ) : (
                  files.map((f) => (
                    <li key={f.id} className="truncate text-sm" title={f.name}>{f.name}</li>
                  ))
                )}
              </ul>
              <Link href="/app/files" className="mt-2 inline-block text-xs text-muted underline underline-offset-4 hover:text-ink">
                Open files →
              </Link>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                <History className="h-3 w-3" /> Memory ({memories?.length ?? "?"})
              </p>
              <ul className="mt-2 space-y-1.5">
                {memories === null ? (
                  <li className="text-sm text-muted">Not checked</li>
                ) : memories.length === 0 ? (
                  <li className="text-sm text-muted">No matches</li>
                ) : (
                  memories.map((m) => (
                    <li key={m.id} className="text-sm">
                      <span className="mr-1.5 rounded-full border border-hairline px-1.5 py-0.5 text-3xs font-medium text-muted">{m.category}</span>
                      {headline(m.content)}
                    </li>
                  ))
                )}
              </ul>
              <Link href="/app/memory" className="mt-2 inline-block text-xs text-muted underline underline-offset-4 hover:text-ink">
                Open memory →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
