"use client";

import React, { useState } from "react";

import { usePrototype } from "../state/store";
import { STATUS_META, type Status } from "../types";
import { Button, Eyebrow, StatusChip } from "./ui";

export function SupportingSections() {
  return (
    <>
      <div className="grid gap-x-8 gap-y-8 px-4 pt-8 sm:px-6 lg:grid-cols-12">
        <Priorities />
        <ActivityStream />
        <CompanyMemory />
      </div>
      <OperatingNumbers />
    </>
  );
}

function Priorities() {
  const { state, dispatch } = usePrototype();
  return (
    <section aria-labelledby="priorities-heading" className="lg:col-span-4">
      <Eyebrow>Priorities</Eyebrow>
      <h2 id="priorities-heading" className="mt-1.5 text-sm font-semibold text-ink">
        What the company is optimising for
      </h2>
      <ol className="mt-3 border-t border-hairline">
        {state.priorities.map((priority, index) => {
          const department = state.departments.find((d) => d.id === priority.ownerDepartmentId);
          const on = state.highlight.departments.includes(priority.ownerDepartmentId);
          const dimmed = state.highlight.departments.length > 0 && !on;
          return (
            <li key={priority.id} className={`border-b border-hairline ${dimmed ? "opacity-40" : ""}`}>
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: "select", selection: { kind: "department", id: priority.ownerDepartmentId } })
                }
                className={`flex w-full items-start gap-3 px-2 py-3 text-left transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] focus-visible:ring-inset ${
                  on ? "bg-brand-tint" : ""
                }`}
              >
                <span className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-faint">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  {/* Wraps rather than truncates: a nowrap title set the min-content
                      of this column and pushed the page sideways on a phone. */}
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-2sm font-semibold text-ink">{priority.title}</span>
                    <StatusChip status={priority.status} size="xs" />
                  </span>
                  <span className="mt-0.5 block text-2xs text-ink-muted">{priority.progress}</span>
                  <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                    {department?.name} · {priority.target}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ActivityStream() {
  const { state, dispatch } = usePrototype();
  return (
    <section aria-labelledby="activity-heading" className="lg:col-span-5">
      <Eyebrow>Company activity</Eyebrow>
      <h2 id="activity-heading" className="mt-1.5 text-sm font-semibold text-ink">
        What the company did, in order
      </h2>
      <ul className="mt-3 border-t border-hairline">
        {state.activity.slice(0, 12).map((event) => {
          const department = state.departments.find((d) => d.id === event.departmentId);
          const clickable = Boolean(event.workId || event.agentId);
          const target = event.workId
            ? ({ kind: "work", id: event.workId } as const)
            : event.agentId
              ? ({ kind: "agent", id: event.agentId } as const)
              : null;
          return (
            <li key={event.id} className="border-b border-hairline">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => target && dispatch({ type: "select", selection: target })}
                className={`flex w-full items-start gap-3 px-2 py-2.5 text-left transition-colors ${
                  clickable ? "hover:bg-surface-secondary" : "cursor-default"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] focus-visible:ring-inset`}
              >
                <span className="mt-0.5 w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  {event.at}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2sm text-ink">
                    <span className="font-semibold">{event.actor}</span> {event.text}
                  </span>
                  {department ? (
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                      {department.name}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CompanyMemory() {
  const { state } = usePrototype();
  const [expanded, setExpanded] = useState(false);
  const recent = expanded ? state.memory.recent : state.memory.recent.slice(0, 2);
  const numbers = [
    { label: "Memories", value: state.memory.total },
    { label: "Decisions", value: state.memory.decisions },
    { label: "Priorities", value: state.memory.activePriorities },
    { label: "Goals", value: state.memory.goals },
  ];
  return (
    <section aria-labelledby="memory-heading" className="lg:col-span-3">
      <Eyebrow>Company memory</Eyebrow>
      <h2 id="memory-heading" className="mt-1.5 text-sm font-semibold text-ink">
        What ORQ8 remembers
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
        {numbers.map((item) => (
          <div key={item.label} className="bg-surface-white px-3 py-2.5">
            <dd className="text-md font-semibold tabular-nums text-ink">{item.value}</dd>
            <dt className="text-3xs font-medium uppercase tracking-[0.14em] text-ink-faint">{item.label}</dt>
          </div>
        ))}
      </dl>
      <ul className="mt-3 grid gap-2">
        {recent.map((entry) => (
          <li key={entry.id} className="border-l-2 border-brand-soft pl-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              {entry.kind} · {entry.at}
            </p>
            <p className="mt-0.5 text-2xs text-ink-muted">{entry.text}</p>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-2 px-0 hover:bg-transparent" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Show fewer" : `Show ${Math.max(state.memory.recent.length - 2, 0)} more`}
      </Button>
      <p className="mt-2 text-2xs text-ink-faint">
        Reading memory in full is not connected in this prototype.
      </p>
    </section>
  );
}

function OperatingNumbers() {
  const { state, counts } = usePrototype();
  const { credits } = state.company;
  const usedPercent = Math.min(100, Math.round((credits.used / credits.allowance) * 100));
  const workMix = (["working", "waiting", "review", "blocked"] as Status[]).map((status) => ({
    status,
    count: state.work.filter((w) => w.status === status).length,
  }));
  const maxAgents = Math.max(...state.departments.map((d) => state.agents.filter((a) => a.departmentId === d.id).length), 1);

  return (
    <section aria-labelledby="numbers-heading" className="px-4 pb-10 pt-9 sm:px-6">
      <Eyebrow>Operating numbers</Eyebrow>
      <h2 id="numbers-heading" className="mt-1.5 text-sm font-semibold text-ink">
        Support for the picture above, nothing more
      </h2>
      <div className="mt-4 grid gap-x-8 gap-y-6 lg:grid-cols-3">
        <div>
          <p className="text-2xs font-medium text-ink">Credits this month</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${usedPercent}%` }} />
          </div>
          <p className="mt-2 text-2xs text-ink-muted">
            {credits.used.toLocaleString()} of {credits.allowance.toLocaleString()} used, {usedPercent}%.
          </p>
          <p className="mt-1 text-2xs text-warm-ink">
            {counts.attentionCredits.toLocaleString()} credits requested and waiting on your queue.
          </p>
        </div>
        <div>
          <p className="text-2xs font-medium text-ink">Work by state</p>
          <ul className="mt-2 grid gap-1.5">
            {workMix.map((row) => (
              <li key={row.status} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-2xs text-ink-muted">
                  <span className={`size-1.5 rounded-full ${STATUS_META[row.status].dot}`} aria-hidden />
                  {STATUS_META[row.status].label}
                </span>
                <span className="text-2xs font-semibold tabular-nums text-ink">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-2xs font-medium text-ink">AI employees per department</p>
          <ul className="mt-2 grid gap-1.5">
            {state.departments.map((department) => {
              const total = state.agents.filter((a) => a.departmentId === department.id).length;
              return (
                <li key={department.id} className="flex items-center gap-3">
                  <span className="w-24 truncate text-2xs text-ink-muted">{department.name}</span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-hairline-strong">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(total / maxAgents) * 100}%` }} />
                  </span>
                  <span className="w-4 text-right text-2xs tabular-nums text-ink">{total}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
