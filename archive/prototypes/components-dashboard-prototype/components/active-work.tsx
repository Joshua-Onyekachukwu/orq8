"use client";

import React from "react";

import { usePrototype } from "../state/store";
import type { WorkFilter } from "../types";
import { Button, Eyebrow, StatusChip, Steps } from "./ui";

const FILTERS: { key: WorkFilter; label: string }[] = [
  { key: "all", label: "All work" },
  { key: "working", label: "Working" },
  { key: "waiting", label: "Waiting" },
  { key: "review", label: "In review" },
  { key: "blocked", label: "Blocked" },
];

const EMPTY: Record<WorkFilter, string> = {
  all: "No work in flight. Create the first work item and the Executive Agent will assign it.",
  working: "Nothing is running right now.",
  waiting: "Nothing is waiting. Every item is moving or needs a decision.",
  review: "Nothing is in review.",
  blocked: "Nothing is blocked. No work is stuck right now.",
};

export function ActiveWork() {
  const { state, dispatch } = usePrototype();
  const rows = state.work.filter((w) => (state.filter === "all" ? true : w.status === state.filter));

  return (
    <section aria-labelledby="work-heading" className="px-4 pt-7 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Work in flight</Eyebrow>
          <h2 id="work-heading" className="mt-1.5 text-lg font-semibold text-ink">
            {state.work.length} work items across {state.departments.length} departments
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter work by status">
          {FILTERS.map((filter) => {
            const on = state.filter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={on}
                onClick={() => dispatch({ type: "set-filter", filter: filter.key })}
                className={`rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] ${
                  on ? "bg-brand-deep text-on-brand" : "text-ink-muted hover:bg-surface-secondary hover:text-ink"
                }`}
              >
                {filter.label}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {filter.key === "all"
                    ? state.work.length
                    : state.work.filter((w) => w.status === filter.key).length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-hairline bg-surface-white px-4 py-6 text-center">
          <p className="text-2sm font-medium text-ink">{EMPTY[state.filter]}</p>
          {state.filter !== "all" ? (
            <Button
              variant="ghost"
              className="mt-1"
              onClick={() => dispatch({ type: "set-filter", filter: "all" })}
            >
              Show all work
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-3 border-t border-hairline">
          {rows.map((item) => {
            const department = state.departments.find((d) => d.id === item.departmentId);
            const agent = state.agents.find((a) => a.id === item.agentId);
            const on = state.highlight.work.includes(item.id);
            const dimmed = state.highlight.work.length > 0 && !on;
            const selected = state.selection?.kind === "work" && state.selection.id === item.id;
            return (
              <li key={item.id} className={`border-b border-hairline transition-opacity ${dimmed ? "opacity-40" : ""}`}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "select", selection: { kind: "work", id: item.id } })}
                  aria-pressed={Boolean(selected)}
                  className={`grid w-full grid-cols-1 items-start gap-x-4 gap-y-2 px-2 py-3 text-left transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] focus-visible:ring-inset sm:grid-cols-[132px_minmax(0,1fr)_auto] ${
                    selected ? "bg-brand-tint" : ""
                  } ${on ? "bg-brand-tint/40" : ""}`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                    {department?.name}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-2sm font-semibold text-ink">{item.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-muted">
                      <span>{agent ? `${agent.name}, ${agent.role.toLowerCase()}` : "Unassigned"}</span>
                      <span aria-hidden>·</span>
                      <span>From {item.origin}</span>
                      <span aria-hidden>·</span>
                      <span>Started {item.startedAt}</span>
                    </span>
                    {item.blockedReason ? (
                      <span className="mt-1 block text-2xs text-error-ink">{item.blockedReason}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3 sm:justify-end">
                    {item.progress ? (
                      <Steps done={item.progress.done} total={item.progress.total} unit={item.progress.unit} />
                    ) : null}
                    <StatusChip status={item.status} size="xs" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
