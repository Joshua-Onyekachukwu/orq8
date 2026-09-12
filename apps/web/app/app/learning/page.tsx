"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  RefreshCw,
  GraduationCap,
  Target,
  Users,
  Cpu,
  BookOpen,
  Newspaper,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
} from "lucide-react";

/**
 * Organizational Learning — the founder-facing view of the intelligence loop.
 *
 * Everything shown is derived from measured data already flowing through the
 * system (§20 decision feedback, §7 model insights, quality-system learning
 * events, scheduled briefings). Nothing is invented: thin data renders an
 * explicit "insufficient data" state instead of a fake number.
 *
 * Data sources (all existing):
 *   /api/decisions/summary   — prediction accuracy (learning score), counts
 *   /api/decisions/signals   — accuracy mix, per-agent reliability vs org baseline
 *   /api/models              — per-model success rates + honest cost insights
 *   /api/quality/learning    — organizational learning events (company memory)
 *   /api/briefings           — scheduled briefing job output (content persisted)
 */

interface DecisionSummary {
  totalDecisions: number;
  activeDecisions: number;
  validatedDecisions: number;
  reversedDecisions: number;
  learningScore: number;
  byType: { type: string; count: number }[];
  recentDecisions: {
    id: string;
    title: string;
    status: string;
    confidence: string;
    predictionAccuracy: string | null;
    actualOutcome: string | null;
    lessonsLearned: string | null;
    createdAt: string;
  }[];
}

interface DecisionSignals {
  decisionsReviewed: number;
  accuracyMix: Record<string, number>;
  models: {
    model: string;
    provider: string;
    phase: string;
    calls: number;
    successRate: number;
    reliability: string;
  }[];
  agents: {
    agentId: string;
    name: string;
    role: string;
    department: string | null;
    tasksCompleted: number;
    tasksFailed: number;
    completionRate: number;
    orgCompletionRate: number;
    verdict: string;
  }[];
}

interface ModelsData {
  stats: {
    totalCalls: number;
    sufficientData: boolean;
    models: {
      model: string;
      provider: string;
      calls: number;
      successRate: number;
      avgDurationMs: number;
    }[];
  };
  insights: {
    kind: string;
    title: string;
    detail: string;
  }[];
}

interface LearningEvent {
  id: string;
  content: string;
  category: string;
  importance: number;
  createdAt: string;
}

interface Briefing {
  id: string;
  kind: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  content: {
    quiet?: boolean;
    sections?: { heading: string; items: string[] }[];
  };
}

const VERDICT_STYLES: Record<string, string> = {
  outperforming: "bg-emerald-50 text-emerald-700",
  on_track: "bg-blue-50 text-blue-700",
  underperforming: "bg-red-50 text-red-700",
  insufficient_data: "bg-gray-100 text-gray-500",
};

const RELIABILITY_STYLES: Record<string, string> = {
  reliable: "bg-emerald-50 text-emerald-700",
  mixed: "bg-amber-50 text-amber-700",
  degraded: "bg-red-50 text-red-700",
  insufficient_data: "bg-gray-100 text-gray-500",
};

const ACCURACY_STYLES: Record<string, string> = {
  accurate: "bg-emerald-50 text-emerald-700",
  partially_accurate: "bg-amber-50 text-amber-700",
  inaccurate: "bg-red-50 text-red-700",
  unclassified: "bg-gray-100 text-gray-500",
};

function accuracyLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LearningPage() {
  const [summary, setSummary] = useState<DecisionSummary | null>(null);
  const [signals, setSignals] = useState<DecisionSignals | null>(null);
  const [models, setModels] = useState<ModelsData | null>(null);
  const [lessons, setLessons] = useState<LearningEvent[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, sigRes, modRes, lessRes, brieRes] = await Promise.all([
        fetch("/api/decisions/summary"),
        fetch("/api/decisions/signals"),
        fetch("/api/models"),
        fetch("/api/quality/learning?limit=8"),
        fetch("/api/briefings?limit=1"),
      ]);
      if (!sumRes.ok || !sigRes.ok) throw new Error("Failed to load learning data");

      const summaryData = await sumRes.json();
      setSummary(summaryData.data ?? summaryData);
      setSignals((await sigRes.json()).data ?? null);

      if (modRes.ok) {
        const parsed = await modRes.json();
        setModels(parsed.data ?? null);
      }
      if (lessRes.ok) setLessons((await lessRes.json()).data ?? []);
      if (brieRes.ok) {
        const list = (await brieRes.json()).data ?? [];
        setBriefing(Array.isArray(list) && list.length > 0 ? list[0] : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load learning data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <PageErrorBoundary pageName="Organizational Learning" backHref="/app">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
              Organizational intelligence
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              <GraduationCap className="h-6 w-6 text-orq8-green" />
              Learning
            </h1>
            <p className="mt-1 text-sm text-muted">
              What the organization has learned from real decisions, executed work,
              and measured model performance. Every figure is measured — no invented
              metrics.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="mt-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
                <div className="space-y-3">
                  <div className="h-4 w-1/3 rounded bg-hairline" />
                  <div className="h-3 w-2/3 rounded bg-hairline" />
                  <div className="h-3 w-1/2 rounded bg-hairline" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* ── Decision prediction accuracy ── */}
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Target className="h-4 w-4 text-orq8-green" />
                Decision prediction accuracy
              </h2>
              {!summary || summary.totalDecisions === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No decisions recorded yet. As the Decision Council deliberates and
                  outcomes are filed, prediction accuracy appears here.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <div className="rounded-lg border border-hairline bg-canvas p-4">
                      <p className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Learning score
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {summary.learningScore}%
                      </p>
                      <p className="text-3xs text-muted">
                        validated decisions
                      </p>
                    </div>
                    <div className="rounded-lg border border-hairline bg-canvas p-4">
                      <p className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Decisions
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {summary.totalDecisions}
                      </p>
                      <p className="text-3xs text-muted">{summary.activeDecisions} active</p>
                    </div>
                    <div className="rounded-lg border border-hairline bg-canvas p-4">
                      <p className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Outcomes reviewed
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {signals?.decisionsReviewed ?? 0}
                      </p>
                      <p className="text-3xs text-muted">filed in Decision Memory</p>
                    </div>
                    <div className="rounded-lg border border-hairline bg-canvas p-4">
                      <p className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Validated / reversed
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {summary.validatedDecisions} / {summary.reversedDecisions}
                      </p>
                      <p className="text-3xs text-muted">resolved predictions</p>
                    </div>
                  </div>

                  {/* Accuracy mix */}
                  {signals && Object.keys(signals.accuracyMix).length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {Object.entries(signals.accuracyMix).map(([key, n]) => (
                        <span
                          key={key}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                            ACCURACY_STYLES[key] ?? "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {accuracyLabel(key)}
                          <span className="tabular-nums">{n}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Recent decision predictions */}
                  {summary.recentDecisions.length > 0 && (
                    <div className="mt-5 overflow-hidden rounded-lg border border-hairline">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-canvas">
                            {["Decision", "Confidence", "Prediction", "Status"].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 text-left font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {summary.recentDecisions.map((d) => (
                            <tr key={d.id}>
                              <td className="max-w-[22rem] px-4 py-3">
                                <p className="truncate text-sm font-medium text-ink">{d.title}</p>
                                {d.lessonsLearned && (
                                  <p className="mt-0.5 truncate text-xs text-muted">
                                    Lesson: {d.lessonsLearned}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm capitalize text-muted">{d.confidence}</td>
                              <td className="px-4 py-3">
                                {d.predictionAccuracy ? (
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                      ACCURACY_STYLES[d.predictionAccuracy] ?? "bg-gray-100 text-gray-500"
                                    }`}
                                  >
                                    {accuracyLabel(d.predictionAccuracy)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted">Awaiting outcome</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm capitalize text-muted">{d.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Agent reliability ── */}
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Users className="h-4 w-4 text-orq8-green" />
                Agent reliability vs organization baseline
              </h2>
              {!signals || signals.agents.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No active AI employees yet. Reliability is measured against the
                  organization&apos;s baseline as work completes.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {signals.agents.map((a) => (
                    <div
                      key={a.agentId}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {a.name}
                          <span className="ml-2 text-xs font-normal text-muted">{a.role}</span>
                        </p>
                        <p className="text-xs text-muted">
                          {a.tasksCompleted} completed · {a.tasksFailed} failed ·{" "}
                          {Math.round(a.completionRate * 100)}% vs{" "}
                          {Math.round(a.orgCompletionRate * 100)}% org baseline
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          VERDICT_STYLES[a.verdict] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {a.verdict.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                Deep per-employee profiles:{" "}
                <a href="/app/performance" className="inline-flex items-center gap-0.5 text-orq8-green hover:underline">
                  Performance <ArrowRight className="h-3 w-3" />
                </a>
              </p>
            </section>

            {/* ── Model performance ── */}
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Cpu className="h-4 w-4 text-orq8-green" />
                Model performance (rolling 30 days)
              </h2>
              {!models || models.stats.models.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No model calls recorded yet. As your AI workforce executes, each
                  model&apos;s measured success rate appears here.
                </p>
              ) : (
                <>
                  <div className="mt-4 overflow-hidden rounded-lg border border-hairline">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-canvas">
                          {["Model", "Calls", "Success", "Avg duration"].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {models.stats.models.map((m) => (
                          <tr key={`${m.provider}:${m.model}`}>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-ink">{m.model}</p>
                              <p className="text-xs text-muted">{m.provider}</p>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm tabular-nums text-ink">
                              {m.calls}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm tabular-nums text-ink">
                              {Math.round(m.successRate * 100)}%
                            </td>
                            <td className="px-4 py-3 font-mono text-sm tabular-nums text-muted">
                              {(m.avgDurationMs / 1000).toFixed(1)}s
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Honest insights — includes explicit insufficient_data entries */}
                  <div className="mt-4 space-y-2">
                    {models.insights.map((ins, i) => (
                      <div key={i} className="rounded-lg border border-hairline bg-canvas p-3">
                        <p className="text-sm font-medium text-ink">{ins.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">{ins.detail}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* ── What the organization has learned ── */}
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <BookOpen className="h-4 w-4 text-orq8-green" />
                What the organization has learned
              </h2>
              {lessons.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  No learning events yet. Lessons are recorded when agents complete
                  or fail tasks, and from decision outcomes.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {lessons.map((l) => (
                    <div key={l.id} className="rounded-lg border border-hairline p-3">
                      <p className="text-sm text-ink">{l.content}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-3xs text-muted">
                        <span className="rounded-full bg-canvas px-2 py-0.5 font-medium">{l.category}</span>
                        <span>Importance {l.importance}/10</span>
                        <span>{new Date(l.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                Full history:{" "}
                <a href="/app/quality" className="inline-flex items-center gap-0.5 text-orq8-green hover:underline">
                  Quality &amp; Learning <ArrowRight className="h-3 w-3" />
                </a>
              </p>
            </section>

            {/* ── Latest scheduled briefing ── */}
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Newspaper className="h-4 w-4 text-orq8-green" />
                Latest executive briefing
              </h2>
              <p className="mt-1 text-xs text-muted">
                Generated by the scheduled briefing job from your organization&apos;s
                real activity. Job health:{" "}
                <a href="/app/jobs" className="text-orq8-green hover:underline">
                  Scheduled Jobs <ArrowRight className="h-3 w-3" />
                </a>
              </p>
              {!briefing ? (
                <p className="mt-3 text-sm text-muted">
                  No briefing generated yet. The scheduled job produces one per
                  period once your organization has activity.
                </p>
              ) : (
                <div className="mt-4 rounded-lg border border-hairline">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-canvas px-4 py-2.5">
                    <span className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
                      {briefing.kind} briefing ·{" "}
                      {new Date(briefing.periodStart).toLocaleDateString()} –{" "}
                      {new Date(briefing.periodEnd).toLocaleDateString()}
                    </span>
                    <span className="text-3xs text-muted">{briefing.status}</span>
                  </div>
                  {briefing.content?.quiet ? (
                    <p className="px-4 py-3 text-sm text-muted">
                      No significant activity in this period.
                    </p>
                  ) : (
                    <div className="space-y-3 px-4 py-3">
                      {(briefing.content?.sections ?? []).map((s, i) => (
                        <div key={i}>
                          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted">
                            {s.heading}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {s.items.map((item, j) => (
                              <li key={j} className="flex items-start gap-2 text-sm text-ink">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orq8-green" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageErrorBoundary>
  );
}
