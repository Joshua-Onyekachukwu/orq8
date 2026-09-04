"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Brain,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  RefreshCw,
  X,
  Tag,
  Star,
  Clock,
} from "lucide-react";

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

interface MemoryStats {
  totalEntries: number;
  byCategory: Record<string, number>;
  avgImportance: number;
  recentActivity: number;
}

function categoryColor(cat: string) {
  switch (cat) {
    case "fact": return "bg-blue-50 text-blue-700";
    case "decision": return "bg-purple-50 text-purple-700";
    case "lesson": return "bg-amber-50 text-amber-700";
    case "preference": return "bg-[#B8FF66]/10 text-[#1a5c2e]";
    case "workflow": return "bg-indigo-50 text-indigo-700";
    case "context": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-600";
  }
}

function importanceStars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      className={`h-3 w-3 ${i < Math.round(n / 2) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
    />
  ));
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Create form state
  const [newCategory, setNewCategory] = useState("fact");
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newImportance, setNewImportance] = useState(5);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "100");

      const res = await fetch(`/api/memory?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch memory");
      const json = await res.json();
      setEntries(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, query]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/memory/stats");
      if (res.ok) {
        const json = await res.json();
        setStats(json.data ?? null);
      }
    } catch {
      // Stats are optional — don't block on failure
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchStats();
  }, [fetchEntries, fetchStats]);

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
          source: newSource.trim() || undefined,
          importance: newImportance,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to create memory entry");
      }
      const json = await res.json();
      setEntries((prev) => [json.data, ...prev]);
      setShowCreateModal(false);
      setNewContent("");
      setNewSource("");
      setNewImportance(5);
      fetchStats();
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
      setEntries((prev) => prev.filter((e) => e.id !== id));
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const filtered = entries;

  return (
    <PageErrorBoundary pageName="Company Memory" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a5c2e]">
            Knowledge
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Company Memory
          </h1>
          <p className="mt-1 text-sm text-muted">
            Facts, decisions, and lessons your organization learns over time.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { fetchEntries(); fetchStats(); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1a5c2e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#144a24]"
          >
            <Plus className="h-3.5 w-3.5" /> Add memory
          </button>
        </div>
      </header>

      {/* Stats */}
      {stats && (
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-hairline bg-white p-4 text-center">
            <p className="text-2xl font-bold text-ink">{stats.totalEntries}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Total</p>
          </div>
          {Object.entries(stats.byCategory).slice(0, 3).map(([cat, count]) => (
            <div key={cat} className="rounded-xl border border-hairline bg-white p-4 text-center">
              <p className="text-2xl font-bold text-ink">{count}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{cat}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <section className="mt-6 rounded-xl border border-hairline bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory..."
              className="w-full rounded-lg border border-hairline bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-[#1a5c2e]"
            />
          </span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none"
          >
            <option value="all">All categories</option>
            <option value="fact">Facts</option>
            <option value="decision">Decisions</option>
            <option value="lesson">Lessons</option>
            <option value="preference">Preferences</option>
            <option value="workflow">Workflows</option>
            <option value="context">Context</option>
          </select>
        </div>
      </section>

      {/* Loading state */}
      {loading && entries.length === 0 && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-hairline" />
                  <div className="h-3 w-2/3 rounded bg-hairline" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Brain className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">
            {entries.length === 0 ? "No memory entries yet" : "Nothing matches those filters"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {entries.length === 0
              ? "Memory builds automatically as your AI employees execute tasks. You can also add entries manually."
              : "Try widening your search or changing the category filter."}
          </p>
        </div>
      )}

      {/* Memory entries */}
      {!loading && filtered.length > 0 && (
        <div className="mt-6 space-y-3">
          {filtered.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${categoryColor(entry.category)}`}>
                      {entry.category}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {importanceStars(entry.importance)}
                    </span>
                    {entry.source && (
                      <span className="text-[10px] text-muted">via {entry.source}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-ink leading-relaxed">{entry.content}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0b]/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Add Memory Entry</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5">
              {createError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {createError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Category *</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-[#1a5c2e]">
                    <option value="fact">Fact</option>
                    <option value="decision">Decision</option>
                    <option value="lesson">Lesson</option>
                    <option value="preference">Preference</option>
                    <option value="workflow">Workflow</option>
                    <option value="context">Context</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Content *</label>
                  <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={3} placeholder="What should the organization remember?" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-[#1a5c2e] resize-none" required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Source</label>
                  <input type="text" value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="e.g. Executive Agent, Market Researcher" className="w-full rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-[#1a5c2e]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink">Importance (1-10)</label>
                  <input type="range" min={1} max={10} value={newImportance} onChange={(e) => setNewImportance(Number(e.target.value))} className="w-full" />
                  <p className="mt-1 text-xs text-muted text-center font-mono">{newImportance}/10</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:bg-canvas">
                  Cancel
                </button>
                <button type="submit" disabled={!newContent.trim() || creating} className="flex items-center gap-2 rounded-lg bg-[#1a5c2e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#144a24] disabled:opacity-50">
                  {creating ? "Saving..." : "Save Memory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
