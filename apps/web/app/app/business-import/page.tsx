"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  CheckCircle2,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";

/* ── Types ── */

interface ImportFact {
  field: string;
  label: string;
  value: string;
  source: string;
  sourceType: "website" | "founder";
  sourceUrl: string | null;
  confidence: number;
  snippet: string | null;
}

interface ImportProposal {
  recommendedPlaybook: string;
  recommendedPlaybookName: string;
  reasons: string[];
  willCreate: { departments: string[]; agents: string[]; goals: string[] };
}

interface BusinessImport {
  id: string;
  description: string | null;
  websiteUrl: string | null;
  websiteTitle: string | null;
  websiteSummary: string | null;
  websiteError: string | null;
  facts: ImportFact[];
  proposal: ImportProposal | null;
  status: string;
  appliedAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  analysis: { label: "Analyzed", cls: "bg-amber-100 text-amber-800" },
  pending_approval: { label: "Awaiting your approval", cls: "bg-blue-100 text-blue-800" },
  approved: { label: "Approved", cls: "bg-blue-100 text-blue-800" },
  applied: { label: "Applied", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700" },
  failed: { label: "Failed", cls: "bg-rose-100 text-rose-700" },
};

function errorMessage(json: { error?: { message?: string } | string } | null, fallback: string): string {
  if (!json) return fallback;
  const e = json.error;
  if (typeof e === "string") return e;
  return e?.message ?? fallback;
}

function BusinessImportDashboard() {
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<BusinessImport | null>(null);
  const [history, setHistory] = useState<BusinessImport[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/business-imports", { next: { revalidate: 10 } });
      const json = await res.json();
      setHistory(json.data ?? []);
    } catch {
      // Non-fatal — history refreshes lazily.
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function runAnalyze() {
    if (!description.trim() && !websiteUrl.trim()) {
      setError("Describe your company or provide a website URL (or both).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), websiteUrl: websiteUrl.trim() || undefined }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errorMessage(json, "Analysis failed"));
      setCurrent(json.data);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "propose" | "approve" | "reject") {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/business-imports/${current.id}/${action}`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errorMessage(json, "Action was rejected by the server"));
      setCurrent(json.data);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    } finally {
      setBusy(false);
    }
  }

  const status = current ? STATUS_META[current.status] ?? { label: current.status, cls: "bg-muted text-muted-foreground" } : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business Import</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Give ORQ8 a description of your company and a website URL. ORQ8 fetches the site safely, extracts
          evidence-backed facts (each with a source and confidence), proposes an organization, and applies it{" "}
          <span className="font-medium text-foreground">only after you approve</span>.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="bi-desc">
          Company description
        </label>
        <textarea
          id="bi-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="e.g. We run a subscription ecommerce brand selling sustainable fashion to consumers in Europe…"
          className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="bi-url">
              Website URL
            </label>
            <input
              id="bi-url"
              type="text"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={runAnalyze}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Analyze
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>

      {/* Current import detail */}
      {current && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">
                {current.websiteTitle ?? current.websiteUrl ?? "Company profile"}
              </h2>
              {status && <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.label}</span>}
            </div>
            <button
              onClick={() => {
                setCurrent(null);
                setDescription("");
                setWebsiteUrl("");
                setError(null);
              }}
              className="rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              New import
            </button>
          </div>

          {current.websiteError && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Website could not be read ({current.websiteError}) — facts below come from your description. You can retry later.
            </p>
          )}

          {/* Facts */}
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Structured facts with provenance
          </h3>
          {current.facts.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No structured facts were extracted yet. Add a description or a reachable website and analyze again.
            </p>
          ) : (
            <div className="mt-2 grid gap-2">
              {current.facts.map((fact, i) => (
                <div key={`${fact.field}-${i}`} className="rounded-lg border bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{fact.label}</span>
                    <span className="text-sm text-foreground">{fact.value}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                        fact.sourceType === "website" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {fact.sourceType === "website" ? "from website" : "founder description"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{Math.round(fact.confidence * 100)}% confidence</span>
                  </div>
                  {fact.snippet && (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      “{fact.snippet.slice(0, 220)}…”
                    </p>
                  )}
                  {fact.sourceUrl && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Source: {fact.sourceUrl}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Proposal */}
          {current.proposal ? (
            <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
                <Sparkles className="h-4 w-4" /> Proposed organization
              </h3>
              <p className="mt-1 text-sm text-blue-900">
                Recommended model: <span className="font-semibold">{current.proposal.recommendedPlaybookName}</span>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-blue-900/80">
                {current.proposal.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-blue-100 bg-white p-2.5">
                  <p className="font-semibold text-blue-900">Departments</p>
                  <p className="mt-1 text-blue-900/70">{current.proposal.willCreate.departments.length || "—"}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-white p-2.5">
                  <p className="font-semibold text-blue-900">AI employees</p>
                  <p className="mt-1 text-blue-900/70">{current.proposal.willCreate.agents.length || "—"}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-white p-2.5">
                  <p className="font-semibold text-blue-900">Initial goals</p>
                  <p className="mt-1 text-blue-900/70">{current.proposal.willCreate.goals.length || "—"}</p>
                </div>
              </div>
            </div>
          ) : (
            current.status === "analysis" && (
              <button
                onClick={() => runAction("propose")}
                disabled={busy}
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Generate organization proposal
              </button>
            )
          )}

          {/* Approval actions */}
          {current.status === "pending_approval" && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
              <button
                onClick={() => runAction("approve")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                Approve & apply organization
              </button>
              <button
                onClick={() => runAction("reject")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                Reject proposal
              </button>
              <p className="text-[11px] text-muted-foreground">Nothing is applied until you approve. Owners and admins only.</p>
            </div>
          )}

          {current.status === "applied" && (
            <p className="mt-4 flex items-center gap-1.5 border-t pt-4 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Applied — the organization was built and the extracted facts were
              recorded into Company Brain with their provenance.
            </p>
          )}
          {current.status === "rejected" && (
            <p className="mt-4 flex items-center gap-1.5 border-t pt-4 text-sm text-rose-600">
              <XCircle className="h-4 w-4" /> Rejected — nothing was applied or persisted to Company Brain.
            </p>
          )}
        </div>
      )}

      {/* History */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent imports</h2>
          <button
            onClick={loadHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No imports yet. Analyze your company above to get started.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {history.map((imp) => {
              const meta = STATUS_META[imp.status] ?? { label: imp.status, cls: "bg-muted text-muted-foreground" };
              return (
                <button
                  key={imp.id}
                  onClick={() => setCurrent(imp)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {imp.websiteTitle ?? imp.websiteUrl ?? imp.description?.slice(0, 80) ?? "Company import"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(imp.createdAt).toLocaleString()} · {imp.facts.length} facts
                      {imp.proposal ? ` · proposed ${imp.proposal.recommendedPlaybookName}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BusinessImportPage() {
  return (
    <PageErrorBoundary pageName="Business Import">
      <BusinessImportDashboard />
    </PageErrorBoundary>
  );
}
