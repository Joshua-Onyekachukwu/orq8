"use client";

/**
 * Approval → execution bridge (approval-to-execution gap, demo §1).
 *
 * When a founder approves a council recommendation, this CTA offers a one-click
 * "Create the launch plan" action that delegates execution to the Executive Agent
 * — the same streaming command pipeline the command bar uses. The founder gets
 * one quiet working indicator while the pipeline runs (no stage-by-stage
 * narration: execute and report), and the flow ends in one of three honest states:
 *
 *   • Delegated  — EA accepted the objective, tasks created, marker note
 *                  recorded on the decision (Decision Memory).
 *   • Failed     — the stream failed before the EA pipeline started; surfaced,
 *                  retry offered (safe — nothing ran). No marker is recorded.
 *   • Stream lost — the pipeline ran or was mid-flight when the stream died.
 *                  No blind retry (double-execution risk): the founder is
 *                  pointed at Goals & Tasks to verify before re-issuing.
 *                  No marker is recorded.
 *
 * Marker note: on success the decision's founderVerdictNote gets a dated
 * "Execution delegated to the Executive Agent (N tasks)" line via the existing
 * PATCH /v1/decisions endpoint, so Decision Memory — and the council page,
 * which hides the CTA once the marker exists — shows the org acted on the
 * approval. The verdict itself is never overwritten.
 *
 * Pure helpers live in lib/council-delegation.ts (unit-tested there); this
 * component owns only orchestration and rendering.
 */

import { useCallback, useState } from "react";
import { runCommandStream, CommandStreamError } from "../../lib/command-stream";
import { buildDelegationMarkerNote, buildLaunchPlanObjective } from "../../lib/council-delegation";
import { Check, Loader2, Rocket, RefreshCw, XCircle } from "lucide-react";

interface LaunchPlanCtaProps {
  /** Decision (council session) id — the approved recommendation's record. */
  decisionId: string;
  /** Recommendation text — quoted back to the EA for grounded delegation. */
  recommendation: string;
  /** Council confidence — passed as context so the EA weighs risk. */
  confidence: string;
  /** Refetches the session list after the marker note is recorded. */
  onDelegated?: () => void;
}

type Phase = "idle" | "running" | "delegated" | "failed" | "stream_lost";

export function LaunchPlanCta({ decisionId, recommendation, confidence, onDelegated }: LaunchPlanCtaProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [markerRecorded, setMarkerRecorded] = useState(false);
  // The EA's own honest execution summary (may include governance blocks).
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const delegate = useCallback(async () => {
    setPhase("running");
    setTaskIds([]);
    setError(null);
    setMarkerRecorded(false);
    try {
      const result = await runCommandStream({
        command: buildLaunchPlanObjective(recommendation),
        context: {
          source: "council_launch_plan_cta",
          councilDecisionId: decisionId,
          councilConfidence: confidence,
        },
        onTask: (e) => {
          setTaskIds((prev) => (prev.includes(e.taskId) ? prev : [...prev, e.taskId]));
        },
      });
      // Pipeline completed. The final result's taskIds are authoritative
      // (task events may be sparse); fall back to the streamed tally.
      const resultTaskIds: string[] = Array.isArray(result?.taskIds) ? result.taskIds : taskIds;
      setTaskIds(resultTaskIds);
      // Honest execution status: the EA may report partial results (e.g. a
      // task blocked by governance) — delegation succeeded either way, and
      // the founder sees the real status rather than a blanket success.
      const resultMessage: string = typeof result?.message === "string" ? result.message : "";
      setResultMessage(resultMessage);
      setPhase("delegated");

      // Record the delegation marker in Decision Memory. Delegation happened
      // (tasks exist); a marker-write failure is surfaced honestly, not hidden.
      try {
        const res = await fetch(`/api/decisions/${decisionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ founderVerdictNote: buildDelegationMarkerNote(resultTaskIds.length) }),
        });
        setMarkerRecorded(res.ok);
        if (res.ok) onDelegated?.();
      } catch {
        setMarkerRecorded(false);
      }
    } catch (err) {
      // Even when the pipeline errors AFTER starting, tasks may already exist
      // (e.g. delegation succeeded, then a governance block hit one task).
      // That is a completed delegation with honest partial execution — record
      // the marker and say exactly what happened, never a blanket failure.
      if (taskIds.length > 0) {
        setPhase("delegated");
        try {
          const res = await fetch(`/api/decisions/${decisionId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ founderVerdictNote: buildDelegationMarkerNote(taskIds.length) }),
          });
          setMarkerRecorded(res.ok);
          if (res.ok) onDelegated?.();
        } catch {
          setMarkerRecorded(false);
        }
        setError(err instanceof CommandStreamError ? err.message : "The delegation stream ended unexpectedly.");
        return;
      }
      if (err instanceof CommandStreamError && !err.pipelineStarted) {
        // Stream never started — safe to offer retry.
        setError(err.message);
        setPhase("failed");
      } else {
        // Pipeline started and failed, or the stream dropped mid-flight.
        // No blind retry (possible double-execution). Honest state + manual path.
        setError(
          err instanceof CommandStreamError
            ? err.message
            : "The delegation stream ended unexpectedly.",
        );
        setPhase("stream_lost");
      }
    }
  }, [recommendation, decisionId, confidence, taskIds, onDelegated]);

  if (phase === "idle") {
    return (
      <div className="rounded-lg border border-brand-deep/30 bg-brand-deep/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-2xs font-semibold text-brand-ink uppercase tracking-wide">Approved — ready to execute</span>
            <p className="mt-0.5 text-2xs text-muted">
              Hand this recommendation to the Executive Agent to plan and execute it.
            </p>
          </div>
          <button
            onClick={delegate}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-deep px-3 py-1.5 text-2xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            <Rocket className="h-3 w-3" /> Create the launch plan
          </button>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div className="rounded-lg border border-hairline bg-muted/5 p-3">
        <span className="text-2xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Executive Agent is working — the result appears here when it is ready
        </span>
      </div>
    );
  }

  if (phase === "delegated") {
    return (
      <div className="rounded-lg border border-brand-deep/30 bg-brand-deep/5 p-3">
        <span className="text-2xs font-semibold text-brand-ink uppercase tracking-wide flex items-center gap-1.5">
          <Check className="h-3 w-3" /> Execution delegated
        </span>
        <p className="mt-1 text-2xs text-ink">
          {taskIds.length > 0
            ? `The Executive Agent created ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} from this recommendation.`
            : "The Executive Agent picked up this recommendation."}{" "}
          {markerRecorded
            ? "Recorded in Decision Memory — the verdict now shows the org acted on it."
            : "Delegation could not be recorded in Decision Memory — the execution itself succeeded."}
        </p>
        {error && (
          <p className="mt-1 text-2xs text-warm-ink">Execution status from the EA: {error}</p>
        )}
        {resultMessage && (
          <p className="mt-1 whitespace-pre-line text-2xs text-muted">{resultMessage.slice(0, 400)}</p>
        )}
        <a
          href="/app/goals"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-deep/40 px-3 py-1.5 text-2xs font-semibold text-brand-ink hover:bg-brand-deep/10 transition-colors"
        >
          View in Goals &amp; Tasks
        </a>
      </div>
    );
  }

  // failed | stream_lost
  return (
    <div className="rounded-lg border border-border-error bg-error-soft/50 p-3">
      <span className="text-2xs font-semibold text-error-ink uppercase tracking-wide flex items-center gap-1.5">
        <XCircle className="h-3 w-3" /> {phase === "failed" ? "Delegation failed" : "Connection lost mid-delegation"}
      </span>
      <p className="mt-1 text-2xs text-ink">{error}</p>
      {phase === "stream_lost" && (
        <p className="mt-1 text-2xs text-muted">
          The Executive Agent may already be executing this objective. Check Goals &amp; Tasks before retrying to avoid
          duplicate work.
        </p>
      )}
      {phase === "failed" && (
        <button
          onClick={delegate}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border-error px-3 py-1.5 text-2xs font-semibold text-error-ink hover:bg-error-soft transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      )}
      <a
        href="/app/goals"
        className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-2xs font-medium text-ink hover:bg-muted/10 transition-colors"
      >
        Check Goals &amp; Tasks
      </a>
    </div>
  );
}
