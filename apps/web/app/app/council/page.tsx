"use client";

/**
 * Decision Council (§47) — founder-readable explanation of multi-agent
 * deliberation sessions.
 *
 * Shows: the decision, who analyzed it, which models were used, key evidence,
 * disagreements, risks, unknowns, confidence, the recommendation, and its
 * current outcome status. Raw analyses are collapsed by default — detailed
 * inspection is available on demand without dumping transcripts by default.
 * Nothing is displayed that the session did not record; missing pieces render
 * as explicit "not recorded" rather than placeholders.
 */

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Scale,
  ChevronDown,
  ChevronRight,
  Users,
  Cpu,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  GitBranch,
  Loader2,
  RefreshCw,
  MessageSquareWarning,
} from "lucide-react";

interface CouncilListItem {
  id: string;
  title: string;
  decisionType: string;
  status: string;
  confidence: string;
  whatWasDecided: string;
  rationale: string | null;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface CouncilDetail {
  question: string;
  context: string | null;
  participants: Array<{ name: string; role: string; model: string | null; department: string }>;
  rounds: Array<{
    round: number;
    analyses: Array<{
      participant: string;
      role: string;
      model: string | null;
      analysis: string;
      claims: Array<{ kind: string; text: string }>;
      tokensUsed: number;
    }>;
  }>;
  disagreements: string[];
  risks: string[];
  unknowns: string[];
  alternatives: Array<{ name: string; reasonRejected: string }>;
  consensusReached: boolean;
  confidence: string;
  requiresFounderApproval: boolean;
  budgetUsd: number;
  totalTokensUsed: number;
  stoppedReason: string;
}

const ROUND_NAMES: Record<number, string> = {
  1: "Round 1 — Independent analysis",
  2: "Round 2 — Cross-examination",
  3: "Round 3 — Re-analysis",
};

function confidenceColor(c: string) {
  if (c === "high") return "text-orq8-green";
  if (c === "low" || c === "none") return "text-red-500";
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

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-2xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
        {icon} {title}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Chips({ items, tone }: { items: string[]; tone: "risk" | "unknown" | "neutral" }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted italic">None recorded</p>;
  }
  const toneClass =
    tone === "risk" ? "bg-red-50 text-red-600" : tone === "unknown" ? "bg-amber-50 text-amber-700" : "bg-muted/10 text-ink";
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className={`rounded-full px-2 py-0.5 text-2xs ${toneClass}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function SessionCard({ session, onOpen }: { session: CouncilListItem; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-hairline bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Scale className="h-4 w-4 shrink-0 text-purple-500" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-ink truncate">{session.title}</h4>
          <div className="flex items-center gap-2 mt-0.5 text-2xs text-muted">
            <span>{formatTimeAgo(session.createdAt)}</span>
            <span className={confidenceColor(session.confidence)}>● {session.confidence} confidence</span>
            {session.actualOutcome ? (
              <span className="text-orq8-green">outcome filed</span>
            ) : (
              <span>outcome pending</span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen(session.id);
          }}
          className="shrink-0 rounded-lg border border-hairline px-2.5 py-1 text-2xs font-medium text-ink hover:bg-muted/10 transition-colors"
        >
          View session
        </button>
        <div className="shrink-0">{expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}</div>
      </div>

      {expanded && (
        <div className="border-t border-hairline px-4 py-4 space-y-3">
          <div>
            <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Recommendation</span>
            <p className="text-xs text-ink mt-1">{session.whatWasDecided}</p>
          </div>
          {session.rationale && (
            <div>
              <span className="text-2xs font-semibold text-muted uppercase tracking-wide">Verdict</span>
              <p className="text-xs text-ink mt-1">{session.rationale}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/5 p-3">
              <span className="text-2xs font-semibold text-muted uppercase">Expected</span>
              <p className="text-xs text-ink mt-1">{session.expectedOutcome ?? "Not recorded"}</p>
            </div>
            <div className="rounded-lg bg-muted/5 p-3">
              <span className="text-2xs font-semibold text-muted uppercase">Actual</span>
              <p className="text-xs text-ink mt-1">
                {session.actualOutcome ?? "Pending — filed automatically after the outcome review runs"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CouncilDetail | null>(null);
  const [meta, setMeta] = useState<{ title: string; confidence: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliberations/${id}`);
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      const d = json.data?.councilDetail;
      if (!d) throw new Error("no-session");
      setDetail(d as CouncilDetail);
      setMeta({ title: json.data.title as string, confidence: json.data.confidence as string });
    } catch {
      setError("Could not load the full session. It may predate full session recording.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRound = (n: number) => {
    setOpenRounds((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className="mt-10 w-full max-w-2xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Decision Council session"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-ink truncate">{meta?.title ?? "Council session"}</h3>
            </div>
            {meta && (
              <p className="mt-0.5 text-2xs text-muted">
                Confidence: <span className={confidenceColor(meta.confidence)}>{meta.confidence}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading session…
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-ink">{error}</p>
              <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-muted/10">
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <Section icon={<Scale className="h-3 w-3" />} title="Question">
                <p className="text-xs text-ink">{detail.question}</p>
                {detail.context && <p className="mt-1 text-2xs text-muted">{detail.context}</p>}
              </Section>

              <Section icon={<Users className="h-3 w-3" />} title="Participants & models">
                <div className="flex flex-wrap gap-1.5">
                  {detail.participants.map((p, i) => (
                    <span key={i} className="rounded-lg bg-muted/10 px-2 py-1 text-2xs text-ink">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-muted"> · {p.role}{p.model ? ` · ${p.model}` : ""}</span>
                    </span>
                  ))}
                </div>
              </Section>

              <Section icon={<MessageSquareWarning className="h-3 w-3" />} title="Disagreements (preserved, not forced)">
                <Chips items={detail.disagreements} tone="neutral" />
              </Section>

              <div className="grid gap-4 sm:grid-cols-2">
                <Section icon={<ShieldAlert className="h-3 w-3" />} title="Risks">
                  <Chips items={detail.risks} tone="risk" />
                </Section>
                <Section icon={<HelpCircle className="h-3 w-3" />} title="Unknowns">
                  <Chips items={detail.unknowns} tone="unknown" />
                </Section>
              </div>

              <Section icon={<GitBranch className="h-3 w-3" />} title="Alternatives considered">
                {detail.alternatives.length === 0 ? (
                  <p className="text-xs text-muted italic">None recorded</p>
                ) : (
                  <div className="space-y-1">
                    {detail.alternatives.map((a, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-ink">{a.name}</span>
                        <span className="text-muted"> — {a.reasonRejected}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={<Cpu className="h-3 w-3" />} title="Process">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                  <span>Consensus: {detail.consensusReached ? "reached" : "none (recorded honestly)"}</span>
                  <span>Stop reason: {detail.stoppedReason.replace(/_/g, " ")}</span>
                  <span>Budget: ${detail.budgetUsd.toFixed(2)}</span>
                  <span>Tokens used: {detail.totalTokensUsed.toLocaleString()}</span>
                  {detail.requiresFounderApproval && <span className="font-semibold text-orq8-orange">Founder approval required</span>}
                </div>
              </Section>

              <Section icon={<MessageSquareWarning className="h-3 w-3" />} title="Rounds — detailed inspection on demand">
                <div className="space-y-1.5">
                  {detail.rounds.map((r) => (
                    <div key={r.round} className="rounded-lg border border-hairline">
                      <button
                        className="flex w-full items-center justify-between px-3 py-2 text-2xs font-semibold text-ink"
                        onClick={() => toggleRound(r.round)}
                        aria-expanded={openRounds.has(r.round)}
                      >
                        {ROUND_NAMES[r.round] ?? `Round ${r.round}`}
                        {openRounds.has(r.round) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      {openRounds.has(r.round) && (
                        <div className="space-y-2 border-t border-hairline px-3 py-2">
                          {r.analyses.map((a, i) => (
                            <div key={i}>
                              <p className="text-2xs font-semibold text-muted">
                                {a.participant}
                                {a.model ? ` · ${a.model}` : ""}
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap text-2xs text-ink">{a.analysis}</p>
                              {a.claims.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {a.claims.map((c, j) => (
                                    <span
                                      key={j}
                                      className={`rounded-full px-1.5 py-0.5 text-3xs ${
                                        c.kind === "evidence"
                                          ? "bg-orq8-green/10 text-orq8-green"
                                          : c.kind === "assumption"
                                            ? "bg-amber-50 text-amber-700"
                                            : "bg-muted/10 text-muted"
                                      }`}
                                    >
                                      {c.kind}: {c.text.slice(0, 90)}{c.text.length > 90 ? "…" : ""}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DecisionCouncilPage() {
  const [sessions, setSessions] = useState<CouncilListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSession, setOpenSession] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/deliberations");
      if (res.ok) {
        const json = await res.json();
        setSessions((json.data ?? []) as CouncilListItem[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageErrorBoundary pageName="Decision Council" backHref="/app">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">Decision Council</h1>
            <p className="mt-1 text-sm text-muted">
              Multi-agent deliberation on significant questions — independent analysis, cross-examination, and honest
              outcomes including &quot;no consensus&quot;.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:bg-muted/10 transition-colors"
            aria-label="Refresh sessions"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-sm text-muted">Loading council sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-10 text-center">
              <Scale className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No council sessions yet</p>
              <p className="mt-1 text-xs text-muted">
                Ask the Executive Agent something significant — &quot;Should we spend $20,000 launching this
                product?&quot; — and the council will deliberate it with independent analyses, cross-examination and a
                synthesized recommendation.
              </p>
            </div>
          ) : (
            sessions.map((s) => <SessionCard key={s.id} session={s} onOpen={setOpenSession} />)
          )}
        </div>

        {openSession && <SessionDetail id={openSession} onClose={() => setOpenSession(null)} />}
      </div>
    </PageErrorBoundary>
  );
}

export default DecisionCouncilPage;
