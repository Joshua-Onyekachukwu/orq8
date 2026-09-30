"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAttention } from "../../hooks/use-attention";
import { useExecutiveAgent } from "../executive-agent-context";
import {
  ATTENTION_SEVERITY_ACCENT,
  ATTENTION_SEVERITY_DESCRIPTIONS,
  ATTENTION_SEVERITY_LABELS,
  ATTENTION_SEVERITY_ORDER,
  ATTENTION_SEVERITY_PILL,
  ATTENTION_SOURCE_HREFS,
  ATTENTION_SOURCE_LABELS,
  proxyPathFor,
  waitingLabel,
  type AttentionAction,
  type AttentionItem,
  type AttentionSnapshot,
} from "../../lib/attention";

/**
 * Attention board.
 *
 * Renders the queue exactly as the API produced it and runs each action
 * against the same endpoint the rest of the app uses (approve, reject, retry,
 * pause, cancel, acknowledge), then refetches so the list reflects the real
 * persisted state rather than an optimistic guess.
 */
export function AttentionBoard({ initial }: { initial: AttentionSnapshot | null }) {
  const { data, loading, error, refresh } = useAttention(initial);
  const { openPanel } = useExecutiveAgent();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [queuedBusy, setQueuedBusy] = useState(false);
  const [queuedSummary, setQueuedSummary] = useState<string | null>(null);

  /**
   * Run this company's queued work (docs/66 §66.19).
   *
   * The batch runner had no caller anywhere, so queued work only moved when
   * someone asked for one task by name — through curl. Work waiting on a human
   * is in `awaiting_approval` rather than `pending`, so the API excludes it and
   * pressing this can never answer a question on the founder's behalf.
   */
  const runQueued = useCallback(async () => {
    setQueuedBusy(true);
    setActionError(null);
    setQueuedSummary(null);
    try {
      const res = await fetch("/api/commands/tasks/execute-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? "The queued work could not be run.");
      }
      const run = payload?.data as
        | { executed: number; completed: number; failed: number; deferred: number }
        | undefined;
      setQueuedSummary(
        !run || run.executed === 0
          ? "Nothing was queued: every task is done, waiting on your decision, or already running."
          : `Ran ${run.executed} task${run.executed === 1 ? "" : "s"}: ${run.completed} completed, ${run.failed} failed, ${run.deferred} still waiting on you.`,
      );
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The queued work could not be run.");
    } finally {
      setQueuedBusy(false);
    }
  }, [refresh]);

  const runAction = useCallback(
    async (item: AttentionItem, action: AttentionAction) => {
      if (action.kind === "ask_ea") {
        openPanel(action.prompt);
        return;
      }
      if (!action.endpoint || !action.method) return;
      const key = `${item.id}:${action.kind}`;
      setBusy(key);
      setActionError(null);
      try {
        const res = await fetch(proxyPathFor(action.endpoint), {
          method: action.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.payload ?? {}),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            (payload as { error?: { message?: string } } | null)?.error?.message ??
              "The action could not be completed.",
          );
        }
        setResolved((prev) => ({ ...prev, [item.id]: action.label }));
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "The action could not be completed.");
      } finally {
        setBusy(null);
      }
    },
    [openPanel, refresh],
  );

  const snapshot = data;
  const items = snapshot?.items ?? [];
  const summary = snapshot?.summary;

  return (
    <div className="space-y-6">
      {/* Queue header: real counts, freshness, manual refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hairline bg-white p-4">
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warm/10">
            <AlertTriangle className="h-5 w-5 text-warm-ink" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {summary
                ? `${summary.total} item${summary.total === 1 ? "" : "s"} in the queue`
                : "Loading the queue"}
            </p>
            <p className="text-xs text-muted">
              {summary
                ? `${summary.critical} critical, ${summary.warning} needing a decision, ${summary.info} for information`
                : "Reading real approvals, work and alerts."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {snapshot && (
            <span className="font-mono text-3xs uppercase text-muted">
              {snapshot.truncated ? "showing the first 50" : `as of ${new Date(snapshot.generatedAt).toLocaleTimeString()}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => void runQueued()}
            disabled={queuedBusy}
            title="Run the work this company has queued. Work waiting on your decision is not touched."
            className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-deep disabled:opacity-50"
          >
            <PlayCircle className={`h-3.5 w-3.5 ${queuedBusy ? "animate-pulse" : ""}`} />
            {queuedBusy ? "Running queued work…" : "Run queued work"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-deep disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {(error || actionError) && (
        <p role="alert" className="rounded-lg border border-border-error bg-error-soft px-4 py-3 text-sm text-error-ink">
          {actionError ?? error}
        </p>
      )}

      {queuedSummary && (
        <p className="rounded-lg border border-hairline bg-canvas px-4 py-3 text-sm text-ink">
          {queuedSummary}
        </p>
      )}

      {snapshot && items.length === 0 ? (
        <QuietState onAsk={() => openPanel("My attention queue is empty. What should I work on next?")} />
      ) : (
        ATTENTION_SEVERITY_ORDER.map((severity) => {
          const group = items.filter((item) => item.severity === severity);
          if (group.length === 0) return null;
          return (
            <section key={severity} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-sm font-semibold text-ink">
                  {ATTENTION_SEVERITY_LABELS[severity]}
                </h2>
                <span className="font-mono text-3xs uppercase text-muted">
                  {group.length} item{group.length === 1 ? "" : "s"}
                </span>
                <p className="text-xs text-muted">{ATTENTION_SEVERITY_DESCRIPTIONS[severity]}</p>
              </div>

              <ul className="space-y-3">
                {group.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-xl border border-hairline border-l-4 bg-white p-5 ${ATTENTION_SEVERITY_ACCENT[item.severity]}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-canvas px-2.5 py-0.5 font-mono text-3xs uppercase tracking-wide text-muted">
                        {ATTENTION_SOURCE_LABELS[item.source]}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 font-mono text-3xs uppercase tracking-wide ${ATTENTION_SEVERITY_PILL[item.severity]}`}>
                        {item.severity}
                      </span>
                      <span className="font-mono text-3xs uppercase text-muted">{waitingLabel(item.createdAt)}</span>
                      {resolved[item.id] && (
                        <span className="flex items-center gap-1 font-mono text-3xs uppercase text-brand-ink">
                          <CheckCircle2 className="h-3 w-3" />
                          {resolved[item.id]}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-3 text-md font-semibold text-ink">{item.what}</h3>
                    <p className="mt-1 text-sm text-muted">{item.why}</p>

                    <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      {item.who && (
                        <div className="flex gap-2">
                          <dt className="font-semibold text-ink">Who</dt>
                          <dd className="text-muted">{item.who}</dd>
                        </div>
                      )}
                      {item.impact && (
                        <div className="flex gap-2">
                          <dt className="font-semibold text-ink">Impact</dt>
                          <dd className="text-muted">{item.impact}</dd>
                        </div>
                      )}
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="font-semibold text-ink">Your authority</dt>
                        <dd className="text-muted">{item.authority}</dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="font-semibold text-ink">Next</dt>
                        <dd className="text-muted">{item.next}</dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {item.actions.map((action) => {
                        const key = `${item.id}:${action.kind}`;
                        const isAsk = action.kind === "ask_ea";
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => void runAction(item, action)}
                            disabled={busy !== null}
                            className={
                              isAsk
                                ? "flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:border-brand-deep disabled:opacity-50"
                                : action.kind === "reject" || action.kind === "cancel"
                                  ? "flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-border-error hover:text-error-ink disabled:opacity-50"
                                  : "flex items-center gap-1.5 rounded-lg ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
                            }
                          >
                            {busy === key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isAsk ? (
                              <Sparkles className="h-3.5 w-3.5" />
                            ) : action.kind === "approve" || action.kind === "acknowledge" ? (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            ) : null}
                            {action.label}
                          </button>
                        );
                      })}
                      <Link
                        href={ATTENTION_SOURCE_HREFS[item.source]}
                        className="ml-auto flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
                      >
                        See the record
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

/** Honest empty state: no invented items, only real next steps. */
function QuietState({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-deep/10">
        <CheckCircle2 className="h-6 w-6 text-brand-ink" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-ink">Nothing needs your decision</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
        No pending approvals, no stalled high priority work, no failures awaiting review, no
        unacknowledged Work Credit alerts, and no deadlines at risk. This page fills itself from
        your company records, so it will show work the moment there is any.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onAsk}
          className="flex items-center gap-1.5 rounded-lg ink px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask what to work on next
        </button>
        <Link
          href="/app/goals"
          className="rounded-lg border border-hairline px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-deep"
        >
          Set a goal
        </Link>
        <Link
          href="/app/agents"
          className="rounded-lg border border-hairline px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-deep"
        >
          Hire an AI employee
        </Link>
        <Link
          href="/app/council"
          className="rounded-lg border border-hairline px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-deep"
        >
          Run a decision council
        </Link>
      </div>
    </div>
  );
}
