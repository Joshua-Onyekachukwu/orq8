"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  BookOpen,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Filter,
  TrendingUp,
  ArrowUpRight,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface Decision {
  id: string;
  title: string;
  decisionType: string;
  status: string;
  confidence: string;
  decisionMakerType: string;
  decisionMakerName: string | null;
  whatWasDecided: string;
  rationale: string | null;
  alternatives: Array<{ name: string; reasonRejected: string }>;
  evidence: Array<{ source: string; type: string; summary: string }>;
  assumptions: string[];
  expectedOutcome: string | null;
  actualOutcome: string | null;
  outcomeFiledAt: string | null;
  reversalConditions: string[];
  lessonsLearned: string | null;
  strategyId: string | null;
  objectiveId: string | null;
  taskId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface DecisionSummary {
  totalDecisions: number;
  activeDecisions: number;
  validatedDecisions: number;
  reversedDecisions: number;
  learningScore: number;
  byType: Array<{ type: string; count: number }>;
  recentDecisions: Decision[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function typeColor(t: string) {
  const map: Record<string, string> = {
    strategic: "bg-purple-100 text-purple-700",
    operational: "bg-blue-50 text-blue-700",
    hiring: "bg-amber-50 text-amber-700",
    resource_allocation: "bg-orange-50 text-orange-700",
    technical: "bg-cyan-50 text-cyan-700",
    partnership: "bg-green-50 text-green-700",
    product: "bg-indigo-50 text-indigo-700",
    marketing: "bg-pink-50 text-pink-700",
    financial: "bg-emerald-50 text-emerald-700",
  };
  return map[t] ?? "bg-hairline text-muted";
}

function statusIcon(s: string) {
  if (s === "validated") return <CheckCircle2 className="h-4 w-4 text-orq8-green" />;
  if (s === "reversed") return <XCircle className="h-4 w-4 text-red-500" />;
  if (s === "active") return <Clock className="h-4 w-4 text-orq8-orange" />;
  if (s === "pending") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Clock className="h-4 w-4 text-muted" />;
}

function confidenceColor(c: string) {
  if (c === "high") return "text-orq8-green";
  if (c === "low") return "text-red-500";
  return "text-muted";
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T | null> {
  try {
    const res = await fetch(`/api/decisions${path}`, {
      method: opts?.method ?? "GET",
      headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Modal ───────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-hairline bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Decision Card ───────────────────────────────────────────────────────────

function DecisionCard({ decision, onUpdate }: { decision: Decision; onUpdate: (id: string, data: Record<string, unknown>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [actualOutcome, setActualOutcome] = useState(decision.actualOutcome ?? "");
  const [status, setStatus] = useState(decision.status);
  const [lessons, setLessons] = useState(decision.lessonsLearned ?? "");

  const saveOutcome = () => {
    onUpdate(decision.id, { actualOutcome, status, lessonsLearned: lessons || undefined });
    setShowOutcome(false);
  };

  return (
    <div className="rounded-xl border border-hairline bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0">{statusIcon(decision.status)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-ink truncate">{decision.title}</h4>
            <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${typeColor(decision.decisionType)}`}>
              {decision.decisionType.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-2xs text-muted">
            <span>{formatTimeAgo(decision.createdAt)}</span>
            {decision.decisionMakerName && <span>by {decision.decisionMakerName}</span>}
            <span className={confidenceColor(decision.confidence)}>● {decision.confidence} confidence</span>
          </div>
        </div>
        <div className="shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-hairline px-4 py-4 space-y-4">
          {/* What was decided */}
          <div>
            <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Decision</span>
            <p className="text-xs text-ink mt-1">{decision.whatWasDecided}</p>
          </div>

          {/* Rationale */}
          {decision.rationale && (
            <div>
              <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Rationale</span>
              <p className="text-xs text-ink mt-1">{decision.rationale}</p>
            </div>
          )}

          {/* Expected vs Actual */}
          <div className="grid grid-cols-2 gap-3">
            {decision.expectedOutcome && (
              <div className="rounded-lg bg-muted/5 p-3">
                <span className="text-2xs font-semibold text-muted uppercase">Expected</span>
                <p className="text-xs text-ink mt-1">{decision.expectedOutcome}</p>
              </div>
            )}
            {decision.actualOutcome && (
              <div className="rounded-lg bg-muted/5 p-3">
                <span className="text-2xs font-semibold text-muted uppercase">Actual</span>
                <p className="text-xs text-ink mt-1">{decision.actualOutcome}</p>
              </div>
            )}
          </div>

          {/* Alternatives */}
          {decision.alternatives.length > 0 && (
            <div>
              <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Alternatives Considered</span>
              <div className="mt-1 space-y-1">
                {decision.alternatives.map((alt, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-ink">{alt.name}</span>
                    <span className="text-muted"> — {alt.reasonRejected}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reversal Conditions */}
          {decision.reversalConditions.length > 0 && (
            <div>
              <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Reversal Conditions</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {decision.reversalConditions.map((rc, i) => (
                  <span key={i} className="rounded-full bg-red-50 px-2 py-0.5 text-2xs text-red-600">{rc}</span>
                ))}
              </div>
            </div>
          )}

          {/* Lessons */}
          {decision.lessonsLearned && (
            <div className="rounded-lg bg-orq8-green/5 border border-orq8-green/20 p-3">
              <span className="text-2xs font-semibold text-orq8-green uppercase">Lessons Learned</span>
              <p className="text-xs text-ink mt-1">{decision.lessonsLearned}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setShowOutcome(!showOutcome)}
              className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-2xs font-medium text-muted hover:text-ink hover:border-ink/20 transition-colors"
            >
              {decision.actualOutcome ? "Update Outcome" : "File Outcome"}
            </button>
          </div>

          {/* Outcome Form */}
          {showOutcome && (
            <div className="rounded-lg border border-hairline bg-muted/5 p-3 space-y-2">
              <textarea
                value={actualOutcome}
                onChange={e => setActualOutcome(e.target.value)}
                placeholder="What actually happened?"
                rows={2}
                className="w-full rounded border border-hairline px-2 py-1.5 text-xs text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
              />
              <div className="flex items-center gap-2">
                <select value={status} onChange={e => setStatus(e.target.value)} className="rounded border border-hairline px-2 py-1 text-2xs text-ink">
                  <option value="active">Active</option>
                  <option value="validated">Validated ✓</option>
                  <option value="reversed">Reversed ✗</option>
                  <option value="archived">Archived</option>
                </select>
                <input
                  value={lessons}
                  onChange={e => setLessons(e.target.value)}
                  placeholder="Lessons learned (optional)"
                  className="flex-1 rounded border border-hairline px-2 py-1 text-2xs text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
                />
                <button onClick={saveOutcome} className="rounded bg-orq8-green px-2 py-1 text-2xs font-semibold text-white">Save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function DecisionsPage() {
  const [summary, setSummary] = useState<DecisionSummary | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showNew, setShowNew] = useState(false);

  // Form
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState("operational");
  const [formConfidence, setFormConfidence] = useState("medium");
  const [formWhat, setFormWhat] = useState("");
  const [formRationale, setFormRationale] = useState("");
  const [formExpected, setFormExpected] = useState("");
  const [formReversal, setFormReversal] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [sumRes, decRes] = await Promise.all([
      api<DecisionSummary>("/summary"),
      api<{ decisions: Decision[]; total: number }>(`/?${new URLSearchParams({
        ...(filterType ? { type: filterType } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
      }).toString()}`),
    ]);
    if (sumRes) setSummary(sumRes);
    if (decRes) setDecisions(decRes.decisions);
    setLoading(false);
  }, [filterType, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  const createDecision = async () => {
    if (!formTitle.trim() || !formWhat.trim()) return;
    const body: Record<string, unknown> = {
      title: formTitle,
      decisionType: formType,
      confidence: formConfidence,
      whatWasDecided: formWhat,
    };
    if (formRationale) body.rationale = formRationale;
    if (formExpected) body.expectedOutcome = formExpected;
    if (formReversal) body.reversalConditions = formReversal.split(",").map(s => s.trim()).filter(Boolean);

    await api("/", { method: "POST", body });
    setFormTitle(""); setFormWhat(""); setFormRationale(""); setFormExpected(""); setFormReversal("");
    setShowNew(false);
    loadData();
  };

  const updateDecision = async (id: string, data: Record<string, unknown>) => {
    await api(`/${id}`, { method: "PATCH", body: data });
    loadData();
  };

  return (
    <PageErrorBoundary pageName="Decision Memory" backHref="/app">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">Decision Memory</h1>
            <p className="mt-1 text-sm text-muted">
              Record decisions, track outcomes, learn from what happened.
            </p>
          </div>
          <button
            onClick={() => { setFormTitle(""); setFormWhat(""); setFormRationale(""); setFormExpected(""); setFormReversal(""); setShowNew(true); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orq8-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Record Decision
          </button>
        </div>

        {/* Learning Score */}
        {summary && (
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-hairline bg-white p-5">
              <div className="text-2xl font-bold text-ink font-mono">{summary.totalDecisions}</div>
              <div className="text-2xs text-muted mt-1">Total Decisions</div>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-5">
              <div className="text-2xl font-bold text-orq8-green font-mono">{summary.validatedDecisions}</div>
              <div className="text-2xs text-muted mt-1">Validated</div>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-5">
              <div className="text-2xl font-bold text-red-500 font-mono">{summary.reversedDecisions}</div>
              <div className="text-2xs text-muted mt-1">Reversed</div>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className={`h-4 w-4 ${summary.learningScore >= 70 ? "text-orq8-green" : summary.learningScore >= 40 ? "text-amber-500" : "text-red-500"}`} />
                <span className="text-2xl font-bold text-ink font-mono">{summary.learningScore}%</span>
              </div>
              <div className="text-2xs text-muted mt-1">Learning Score</div>
              <div className="mt-2 h-1.5 rounded-full bg-muted/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${summary.learningScore >= 70 ? "bg-orq8-green" : summary.learningScore >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${summary.learningScore}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mt-4 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-lg border border-hairline px-2 py-1 text-2xs text-ink">
            <option value="">All types</option>
            <option value="strategic">Strategic</option>
            <option value="operational">Operational</option>
            <option value="hiring">Hiring</option>
            <option value="resource_allocation">Resource Allocation</option>
            <option value="technical">Technical</option>
            <option value="partnership">Partnership</option>
            <option value="product">Product</option>
            <option value="marketing">Marketing</option>
            <option value="financial">Financial</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border border-hairline px-2 py-1 text-2xs text-ink">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="validated">Validated</option>
            <option value="reversed">Reversed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Timeline */}
        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted">Loading decisions…</div>
          ) : decisions.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No decisions recorded yet</p>
              <p className="mt-1 text-xs text-muted">
                Record your first decision to start building organizational learning.
              </p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-orq8-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Record Decision
              </button>
            </div>
          ) : (
            decisions.map(d => (
              <DecisionCard key={d.id} decision={d} onUpdate={updateDecision} />
            ))
          )}
        </div>

        {/* New Decision Modal */}
        <Modal open={showNew} onClose={() => setShowNew(false)} title="Record Decision">
          <div className="space-y-3">
            <input
              autoFocus
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="Decision title (e.g., Launch with $49 pricing)"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
            />
            <textarea
              value={formWhat}
              onChange={e => setFormWhat(e.target.value)}
              placeholder="What was decided? (the actual decision)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <div className="flex gap-3">
              <select value={formType} onChange={e => setFormType(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-xs text-ink">
                <option value="strategic">Strategic</option>
                <option value="operational">Operational</option>
                <option value="hiring">Hiring</option>
                <option value="resource_allocation">Resource Allocation</option>
                <option value="technical">Technical</option>
                <option value="partnership">Partnership</option>
                <option value="product">Product</option>
                <option value="marketing">Marketing</option>
                <option value="financial">Financial</option>
              </select>
              <select value={formConfidence} onChange={e => setFormConfidence(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-xs text-ink">
                <option value="high">High Confidence</option>
                <option value="medium">Medium Confidence</option>
                <option value="low">Low Confidence</option>
              </select>
            </div>
            <textarea
              value={formRationale}
              onChange={e => setFormRationale(e.target.value)}
              placeholder="Rationale — why this decision? (optional)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <textarea
              value={formExpected}
              onChange={e => setFormExpected(e.target.value)}
              placeholder="Expected outcome (optional)"
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green resize-none"
            />
            <input
              value={formReversal}
              onChange={e => setFormReversal(e.target.value)}
              placeholder="Reversal conditions (comma-separated)"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-orq8-green"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNew(false)} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
              <button onClick={createDecision} className="rounded-lg bg-orq8-green px-4 py-1.5 text-xs font-semibold text-white hover:bg-orq8-green/90">Record</button>
            </div>
          </div>
        </Modal>
      </div>
    </PageErrorBoundary>
  );
}
