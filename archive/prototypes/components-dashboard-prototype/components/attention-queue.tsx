"use client";

import React from "react";
import { Check, CornerDownRight, X } from "lucide-react";

import { usePrototype } from "../state/store";
import { Credits } from "./ui";
import { Button, Eyebrow, KindChip, StatusChip } from "./ui";

export function AttentionQueue({ onReview }: { onReview: (id: string) => void }) {
  const { state, dispatch, counts } = usePrototype();

  return (
    <section aria-labelledby="attention-heading" className="px-4 pt-7 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow className="text-warm-ink">Needs your attention</Eyebrow>
          <h2 id="attention-heading" className="mt-1.5 text-lg font-semibold text-ink">
            {counts.attention === 0
              ? "Nothing needs you"
              : `${counts.attention} ${counts.attention === 1 ? "thing only you can move" : "things only you can move"}`}
          </h2>
        </div>
        <p className="text-2xs text-ink-muted">
          Approvals and decisions are the founder's job. Nothing is executed until you decide
          {counts.attentionCredits > 0 ? (
            <>
              , and {counts.attentionCredits.toLocaleString()} credits are waiting on this queue
            </>
          ) : null}
          .
        </p>
      </div>

      {state.attention.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-hairline bg-surface-white px-4 py-6 text-center">
          <p className="inline-flex items-center gap-2 text-2sm font-medium text-ink">
            <Check className="h-4 w-4 text-brand" aria-hidden />
            Attention queue clear
          </p>
          <p className="mt-1 text-2xs text-ink-muted">
            Every work item is either moving or waiting on another AI employee. New requests appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
          {state.attention.map((item) => {
            const department = state.departments.find((d) => d.id === item.departmentId);
            const work = state.work.find((w) => w.id === item.workId);
            const urgent = item.severity === "urgent";
            const on = state.highlight.attention.includes(item.id);
            const dimmed = state.highlight.attention.length > 0 && !on;
            return (
              <li
                key={item.id}
                className={`relative rounded-xl border px-4 py-3.5 transition-all ${
                  urgent ? "border-border-error bg-error-soft" : "border-hairline bg-surface-white"
                } ${dimmed ? "opacity-40" : ""} ${on && !urgent ? "border-brand-soft bg-brand-tint" : ""}`}
              >
                <span
                  className={`absolute inset-y-3 left-0 w-0.5 rounded-full ${
                    urgent ? "bg-error-fill" : "bg-warm"
                  }`}
                  aria-hidden
                />
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <KindChip kind={item.kind} />
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                        {department?.name ?? "Company"}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-ink">{item.title}</h3>
                    <p className="mt-1 max-w-2xl text-2sm text-ink-muted">{item.detail}</p>
                    <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-muted">
                      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                      <span>
                        <span className="font-medium text-ink">Why it needs you:</span> {item.reason}
                      </span>
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-faint">
                      <span>{item.requestedBy}</span>
                      <span aria-hidden>·</span>
                      <span>Raised {item.raisedAt}</span>
                      {item.costCredits !== null ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="text-warm-ink">
                            Costs <Credits value={item.costCredits} />
                          </span>
                        </>
                      ) : null}
                      {work ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>Holds up: {work.title}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" onClick={() => onReview(item.id)}>
                      Review
                    </Button>
                    <Button variant="danger" onClick={() => dispatch({ type: "resolve", id: item.id, decision: "rejected" })}>
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => dispatch({ type: "resolve", id: item.id, decision: "approved" })}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Approve
                    </Button>
                  </div>
                </div>
                {urgent ? (
                  <p className="mt-3 flex items-center gap-2 border-t border-border-error pt-2 text-2xs text-error-ink">
                    <StatusChip status="blocked" size="xs" />
                    Work in Engineering stopped here until you decide.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
