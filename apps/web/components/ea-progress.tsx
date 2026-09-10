"use client";

import { Check, Loader2, Minus, XCircle } from "lucide-react";

/**
 * Live pipeline progress for the Executive Agent (streaming commands).
 * One row per pipeline stage as reported by the SSE stream — only stages
 * the backend actually emitted are shown (no invented steps).
 */
export interface EAProgressStage {
  stage: string;
  label: string;
  status: "started" | "completed" | "skipped" | "failed" | "in_progress";
  /** Live per-task tally inside task_execution (from `task` stream events). */
  done?: number;
  total?: number;
}

export function ExecutiveAgentProgress({
  stages,
  className = "",
}: {
  stages: EAProgressStage[];
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {stages.map((s) => (
        <div key={s.stage} className="flex items-center gap-2 text-sm">
          {s.status === "completed" ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-orq8-green" aria-hidden />
          ) : s.status === "failed" ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
          ) : s.status === "skipped" ? (
            <Minus className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
          ) : (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" aria-hidden />
          )}
          <span
            className={
              s.status === "started" || s.status === "in_progress"
                ? "font-medium text-gray-800"
                : s.status === "failed"
                  ? "text-red-600"
                  : "text-gray-500"
            }
          >
            {s.label}
            {s.status === "in_progress" && typeof s.done === "number" && typeof s.total === "number" && s.total > 0
              ? ` — ${s.done}/${s.total} finished`
              : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
