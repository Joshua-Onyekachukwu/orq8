"use client";

import { useCallback, useEffect, useState } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Boxes,
  Brain,
  CheckCircle2,
  GitFork,
  Landmark,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Scale,
  X,
} from "lucide-react";

/* ── Types ── */

interface KnowledgeEntity {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  fromName: string;
  toName: string;
  relationType: string;
  source: string | null;
  createdAt: string;
}

interface CompanyDecision {
  id: string;
  title: string;
  summary: string | null;
  context: string | null;
  rationale: string | null;
  alternatives: Array<{ label: string; pros?: string; cons?: string }> | null;
  outcome: string | null;
  source: string | null;
  actorType: string | null;
  createdAt: string;
  decidedAt: string | null;
}

interface SearchResult {
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  decisions: CompanyDecision[];
}

const ENTITY_TYPES = [
  "customer", "product", "project", "goal", "department", "agent",
  "decision", "initiative", "experiment", "integration", "custom",
];

const OUTCOME_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 border-emerald-200 text-emerald-700",
  rejected: "bg-red-50 border-red-200 text-red-600",
  modified: "bg-amber-50 border-amber-200 text-amber-700",
  pending: "bg-muted/10 border-hairline text-muted",
};

function entityColor(type: string): string {
  switch (type) {
    case "customer": return "bg-sky-50 border-sky-200 text-sky-700";
    case "product": return "bg-violet-50 border-violet-200 text-violet-700";
    case "project": return "bg-indigo-50 border-indigo-200 text-indigo-700";
    case "goal": return "bg-emerald-50 border-emerald-200 text-emerald-700";
    case "department": return "bg-blue-50 border-blue-200 text-blue-700";
    case "agent": return "bg-cyan-50 border-cyan-200 text-cyan-700";
    case "decision": return "bg-amber-50 border-amber-200 text-amber-700";
    case "initiative": return "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700";
    case "integration": return "bg-teal-50 border-teal-200 text-teal-700";
    default: return "bg-muted/10 border-hairline text-muted";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

/* ── Page ── */

export default function KnowledgePage() {
  const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
  const [relations, setRelations] = useState<KnowledgeRelation[]>([]);
  const [decisions, setDecisions] = useState<CompanyDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);

  // Create forms
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEntity, setNewEntity] = useState({ type: "customer", name: "", summary: "" });
  const [newDecision, setNewDecision] = useState({
    title: "",
    summary: "",
    context: "",
    rationale: "",
    outcome: "approved",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      const [entitiesRes, relationsRes, decisionsRes] = await Promise.all([
        fetch(`/api/knowledge?kind=entities&${params.toString()}`),
        fetch("/api/knowledge?kind=relations&limit=200"),
        fetch("/api/knowledge?kind=decisions&limit=100"),
      ]);
      const [entitiesJson, relationsJson, decisionsJson] = await Promise.all([
        entitiesRes.json(), relationsRes.json(), decisionsRes.json(),
      ]);
      if (!entitiesRes.ok) throw new Error(entitiesJson.error ?? "Failed to load entities");
      if (!relationsRes.ok) throw new Error(relationsJson.error ?? "Failed to load relations");
      if (!decisionsRes.ok) throw new Error(decisionsJson.error ?? "Failed to load decisions");
      setEntities(entitiesJson.data ?? []);
      setRelations(relationsJson.data ?? []);
      setDecisions(decisionsJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load knowledge graph");
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge?kind=search&query=${encodeURIComponent(query.trim())}&limit=12`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setSearchResults(json.data ?? { entities: [], relations: [], decisions: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const saveEntity = async () => {
    if (!newEntity.name.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/knowledge?kind=entity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: newEntity.type, name: newEntity.name.trim(), summary: newEntity.summary.trim() || undefined, source: "user" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to create entity");
      setNewEntity({ type: "customer", name: "", summary: "" });
      setShowEntityForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create entity");
    } finally {
      setSaving(false);
    }
  };

  const saveDecision = async () => {
    if (!newDecision.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/knowledge?kind=decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: newDecision.title.trim(),
          summary: newDecision.summary.trim() || undefined,
          context: newDecision.context.trim() || undefined,
          rationale: newDecision.rationale.trim() || undefined,
          outcome: newDecision.outcome,
          source: "user",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to record decision");
      setNewDecision({ title: "", summary: "", context: "", rationale: "", outcome: "approved" });
      setShowDecisionForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageErrorBoundary pageName="Knowledge Graph">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Company Knowledge Graph</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              The company's long-term intelligence layer — entities (customers, products, goals, agents…),
              the relations between them, and the decisions the company has made, with their rationale.
              The Executive Agent retrieves this context before important work.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowEntityForm(false); setShowDecisionForm(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/10"
            >
              <Scale className="h-4 w-4" /> Record decision
            </button>
            <button
              type="button"
              onClick={() => { setShowDecisionForm(false); setShowEntityForm(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add entity
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/10"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
              placeholder="Search entities, relations and decisions — e.g. “customer onboarding”"
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
          {searchResults && (
            <button
              type="button"
              onClick={() => { setSearchResults(null); setQuery(""); }}
              className="inline-flex items-center gap-1 rounded-lg border border-hairline px-3 py-2 text-sm hover:bg-muted/10"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>

        {/* Search results */}
        {searchResults && (
          <div className="rounded-xl border border-hairline bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="h-4 w-4" /> Search results for “{query.trim()}”
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Entities ({searchResults.entities.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {searchResults.entities.length === 0 && <li className="text-sm text-muted">No matches</li>}
                  {searchResults.entities.map((e) => (
                    <li key={e.id} className="text-sm">
                      <span className={`mr-1.5 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${entityColor(e.type)}`}>{e.type}</span>
                      {e.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Decisions ({searchResults.decisions.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {searchResults.decisions.length === 0 && <li className="text-sm text-muted">No matches</li>}
                  {searchResults.decisions.map((d) => (
                    <li key={d.id} className="text-sm">
                      {d.title}
                      <span className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${d.outcome ? (OUTCOME_STYLES[d.outcome] ?? OUTCOME_STYLES.pending) : OUTCOME_STYLES.pending}`}>{d.outcome ?? "pending"}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Relations ({searchResults.relations.length})</p>
                <ul className="mt-2 space-y-1.5">
                  {searchResults.relations.length === 0 && <li className="text-sm text-muted">No matches</li>}
                  {searchResults.relations.map((r) => (
                    <li key={r.id} className="text-sm text-muted">
                      <span className="text-foreground">{r.fromName}</span> <span className="text-xs italic">{r.relationType.replace(/_/g, " ")}</span> <span className="text-foreground">{r.toName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Create forms */}
        {showEntityForm && (
          <div className="rounded-xl border border-hairline bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Add knowledge entity</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <select
                value={newEntity.type}
                onChange={(e) => setNewEntity({ ...newEntity, type: e.target.value })}
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none"
              >
                {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                value={newEntity.name}
                onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })}
                placeholder="Name (e.g. “Acme Corp”)"
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
              <input
                value={newEntity.summary}
                onChange={(e) => setNewEntity({ ...newEntity, summary: e.target.value })}
                placeholder="Summary (optional)"
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
            </div>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => void saveEntity()} disabled={saving || !newEntity.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create entity
              </button>
              <button type="button" onClick={() => { setShowEntityForm(false); setFormError(null); }} className="rounded-lg border border-hairline px-3 py-1.5 text-sm hover:bg-muted/10">Cancel</button>
            </div>
          </div>
        )}

        {showDecisionForm && (
          <div className="rounded-xl border border-hairline bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4" /> Record a decision</h2>
            <div className="mt-4 grid gap-3">
              <input
                value={newDecision.title}
                onChange={(e) => setNewDecision({ ...newDecision, title: e.target.value })}
                placeholder="Decision (e.g. “Adopt Postgres for the analytics service”)"
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={newDecision.summary}
                  onChange={(e) => setNewDecision({ ...newDecision, summary: e.target.value })}
                  placeholder="Summary (optional)"
                  className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
                />
                <select
                  value={newDecision.outcome}
                  onChange={(e) => setNewDecision({ ...newDecision, outcome: e.target.value })}
                  className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="modified">Modified</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <textarea
                value={newDecision.context}
                onChange={(e) => setNewDecision({ ...newDecision, context: e.target.value })}
                placeholder="Context — what was happening (optional)"
                rows={2}
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
              <textarea
                value={newDecision.rationale}
                onChange={(e) => setNewDecision({ ...newDecision, rationale: e.target.value })}
                placeholder="Rationale — why (never fabricated; leave empty if unknown)"
                rows={2}
                className="rounded-lg border border-hairline bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
            </div>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => void saveDecision()} disabled={saving || !newDecision.title.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record decision
              </button>
              <button type="button" onClick={() => { setShowDecisionForm(false); setFormError(null); }} className="rounded-lg border border-hairline px-3 py-1.5 text-sm hover:bg-muted/10">Cancel</button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-hairline bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted"><Boxes className="h-4 w-4" /> Entities</div>
            <p className="mt-1 text-2xl font-bold">{entities.length}</p>
          </div>
          <div className="rounded-xl border border-hairline bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted"><GitFork className="h-4 w-4" /> Relations</div>
            <p className="mt-1 text-2xl font-bold">{relations.length}</p>
          </div>
          <div className="rounded-xl border border-hairline bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted"><Landmark className="h-4 w-4" /> Decisions</div>
            <p className="mt-1 text-2xl font-bold">{decisions.length}</p>
          </div>
        </div>

        {/* Entities */}
        <section className="rounded-xl border border-hairline bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="h-4 w-4" /> Entities</h2>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setTypeFilter("")} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${!typeFilter ? "border-foreground/40 bg-muted/10" : "border-hairline hover:bg-muted/10"}`}>All</button>
              {ENTITY_TYPES.slice(0, 8).map((t) => (
                <button key={t} type="button" onClick={() => setTypeFilter(typeFilter === t ? "" : t)} className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${typeFilter === t ? "border-foreground/40 bg-muted/10" : "border-hairline hover:bg-muted/10"}`}>{t}</button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading knowledge graph…</div>
          ) : entities.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No entities yet. Add your first entity above — e.g. a customer, product, or key decision.
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {entities.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${entityColor(e.type)}`}>{e.type}</span>
                      <span className="text-sm font-medium">{e.name}</span>
                      {e.source && <span className="text-[10px] text-muted">via {e.source}</span>}
                    </div>
                    {e.summary && <p className="mt-1 text-sm text-muted">{e.summary}</p>}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted">{fmtDate(e.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Relations */}
        <section className="rounded-xl border border-hairline bg-card">
          <div className="border-b border-hairline p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Relations</h2>
            <p className="mt-0.5 text-xs text-muted">How the company's knowledge connects — created via the knowledge API and business-import seeding.</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading relations…</div>
          ) : relations.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No relations yet — entities appear here once they're linked.</div>
          ) : (
            <ul className="divide-y divide-hairline">
              {relations.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">{r.fromName}</span>
                  <span className="rounded-full border border-hairline bg-muted/10 px-2 py-0.5 text-[10px] italic text-muted">{r.relationType.replace(/_/g, " ")}</span>
                  <span className="font-medium">{r.toName}</span>
                  <span className="ml-auto text-[10px] text-muted">{fmtDate(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Decisions */}
        <section className="rounded-xl border border-hairline bg-card">
          <div className="border-b border-hairline p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4" /> Decision Memory</h2>
            <p className="mt-0.5 text-xs text-muted">
              Institutional precedent — decisions with their rationale, captured from approvals and founder records. The Executive Agent consults these before proposing anything new.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading decisions…</div>
          ) : decisions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No decisions recorded yet. Approved approval requests are captured automatically; use “Record decision” for founder decisions outside the approval flow.
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {decisions.map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{d.title}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${d.outcome ? (OUTCOME_STYLES[d.outcome] ?? OUTCOME_STYLES.pending) : OUTCOME_STYLES.pending}`}>{d.outcome ?? "pending"}</span>
                    <span className="ml-auto text-[10px] text-muted">{fmtDate(d.decidedAt ?? d.createdAt)}</span>
                  </div>
                  {d.summary && <p className="mt-1 text-sm text-muted">{d.summary}</p>}
                  {d.context && <p className="mt-1 text-xs text-muted">Context: {d.context}</p>}
                  <p className="mt-1 text-xs">
                    <span className="font-medium">Rationale:</span>{" "}
                    <span className={d.rationale ? "text-muted" : "italic text-muted"}>
                      {d.rationale ?? "No recorded rationale — this decision was made without a documented reason."}
                    </span>
                  </p>
                  {(d.alternatives?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.alternatives!.map((a, i) => (
                        <span key={i} className="rounded-md border border-hairline bg-muted/5 px-2 py-0.5 text-[10px] text-muted">alt: {a.label}</span>
                      ))}
                    </div>
                  )}
                  {d.source && <p className="mt-1 text-[10px] text-muted">Source: {d.source}{d.actorType ? ` · actor: ${d.actorType}` : ""}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All knowledge is company-scoped. Rationale is never fabricated — where none was recorded, the system says so.
        </p>
      </div>
    </PageErrorBoundary>
  );
}