"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { PageContainer } from "../../../components/layout/page-container";
import { Plus, Search, Trash2, AlertCircle, RefreshCw, X, Brain } from "lucide-react";

/**
 * Company Memory (docs/71 §M, marketing/headquarters-mock-v2.html
 * `screen-memory`).
 *
 * The mock's composition: a searchable list on the left — a category chip, the
 * memory, when it was written and by what — and a **detail pane** for the
 * selected entry: its source, and the raw content exactly as it will be handed
 * to an employee. Nothing is pre-seeded and nothing is prettified: the
 * learning system's `[LEARNING-EPISODIC]` blocks and the EA's command records
 * are shown as they are stored, because that literal content is what shapes
 * the employees' next run.
 */

interface MemoryEntry {
  id: string;
  category: string;
  content: string;
  source: string | null;
  agentId: string | null;
  taskId: string | null;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatStamp(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${d
      .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      .replace(/^24:/, "00:")}`;
  } catch {
    return "";
  }
}

/** Strip the internal prefix so the list line reads, but keep detail verbatim. */
function headline(content: string): string {
  const firstLine = content.split("\n")[0] ?? content;
  return firstLine.replace(/^\[[A-Z-]+\]\s*/, "").trim();
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("context");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/memory?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch memory");
      const json = await res.json();
      setEntries(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          content: newContent.trim(),
          source: newSource.trim() || "founder",
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to create memory entry");
      }
      const json = await res.json();
      setEntries((prev) => [json.data, ...prev]);
      setSelectedId(json.data.id);
      setShowCreateModal(false);
      setNewContent("");
      setNewSource("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <PageErrorBoundary pageName="Memory" backHref="/app">
      <PageContainer
        width="standard"
        kicker={`Knowledge · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        title="Memory"
        lede="What the company knows and remembers. Only what actually happened is stored — nothing is pre-seeded."
        pageName="Memory"
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
              type="button"
              onClick={fetchEntries}
              disabled={loading}
              aria-label="Refresh memory"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Remember something
            </button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-error-soft/40 px-3.5 py-2.5">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{error}</p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          {/* The list — searchable, chip per category, writer and date per row. */}
          <section className="console-card order-2 p-4 lg:order-1">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search memory…"
                aria-label="Search memory"
                className="w-full rounded-md border border-hairline bg-canvas py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-hairline-strong"
              />
            </div>

            {loading && entries.length === 0 ? (
              <p className="py-6 text-sm text-muted">Reading the company&apos;s memory…</p>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center">
                <Brain aria-hidden="true" className="mx-auto h-8 w-8 text-muted/40" />
                <p className="mt-3 text-sm font-medium text-ink">
                  {query ? "Nothing matches that search" : "Nothing remembered yet"}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                  {query
                    ? "Try a different word, or clear the search to see everything."
                    : "Memory builds automatically as your employees work and fail. Lessons from a failure, the EA's commands, task results — they all land here."}
                </p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-hairline">
                {entries.map((entry) => {
                  const active = entry.id === selectedId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors ${
                          active ? "bg-elevated" : "hover:bg-elevated"
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-3xs uppercase tracking-wide text-muted">
                          {entry.category}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-xs text-ink">
                            {headline(entry.content)}
                          </span>
                          <span className="mt-0.5 block font-mono text-3xs text-muted">
                            {formatDate(entry.createdAt)} · wrote: {entry.source ?? "system"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* The detail — source and the verbatim stored content. */}
          <section className="console-card order-1 p-4 lg:order-2">
            {!selected ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <Brain aria-hidden="true" className="h-6 w-6 text-muted/40" />
                <p className="mt-2 text-sm text-muted">
                  Select a memory to read it exactly as stored.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Entry detail
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDelete(selected.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-1 font-mono text-3xs uppercase tracking-wide text-muted transition-colors hover:border-error-soft hover:text-error-ink"
                  >
                    <Trash2 aria-hidden="true" className="h-3 w-3" />
                    Forget
                  </button>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{headline(selected.content)}</p>
                <p className="mt-1 font-mono text-3xs text-muted">
                  {formatStamp(selected.createdAt)} · wrote: {selected.source ?? "system"} ·
                  importance {selected.importance}/10
                  {selected.taskId ? ` · from task ${selected.taskId.slice(0, 8)}` : ""}
                </p>
                <p className="mt-4 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  As stored
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-hairline bg-canvas p-3 font-mono text-2xs leading-relaxed text-muted">
                  {selected.content}
                </pre>
              </>
            )}
          </section>
        </div>

      {/* Create modal — writes a real row the employees will be handed. */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Remember something</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-ink"
                aria-label="Close"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="flex items-center gap-2 rounded-lg bg-error-soft px-3 py-2 text-sm text-error-ink">
                  <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" /> {createError}
                </div>
              )}
              <div>
                <label htmlFor="memory-category" className="mb-1 block text-xs font-medium text-ink">
                  Category
                </label>
                <select
                  id="memory-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-hairline-strong"
                >
                  <option value="context">Context</option>
                  <option value="fact">Fact</option>
                  <option value="decision">Decision</option>
                  <option value="lesson">Lesson</option>
                  <option value="preference">Preference</option>
                  <option value="workflow">Workflow</option>
                </select>
              </div>
              <div>
                <label htmlFor="memory-content" className="mb-1 block text-xs font-medium text-ink">
                  What should the organization remember?
                </label>
                <textarea
                  id="memory-content"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  required
                  className="w-full resize-none rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-hairline-strong"
                />
              </div>
              <div>
                <label htmlFor="memory-source" className="mb-1 block text-xs font-medium text-ink">
                  Source (optional)
                </label>
                <input
                  id="memory-source"
                  type="text"
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  placeholder="founder"
                  className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-hairline-strong"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-hairline px-3.5 py-2 text-xs font-medium text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                >
                  Save memory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </PageContainer>
    </PageErrorBoundary>
  );
}
