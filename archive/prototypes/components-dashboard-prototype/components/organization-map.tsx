"use client";

import React, { useState } from "react";
import { ChevronRight, Plus, Users } from "lucide-react";

import { usePrototype } from "../state/store";
import { STATUS_META, STATUS_ORDER, type Agent, type Department, type Status } from "../types";
import { Button, DepartmentIcon, Eyebrow, FOCUS, Initials, StatusChip, Steps } from "./ui";

/** A department reads at the aggregate level: blocked beats waiting beats working. */
function aggregateStatus(agents: Agent[]): Status {
  if (agents.length === 0) return "offline";
  for (const status of ["blocked", "waiting", "review", "working", "active", "paused", "offline"] as Status[]) {
    if (agents.some((a) => a.status === status)) return status;
  }
  return "done";
}

type Props = {
  onHireInto: (departmentId: string) => void;
  onFocusEa: () => void;
};

export function OrganizationMap({ onHireInto, onFocusEa }: Props) {
  const { state, dispatch, counts } = usePrototype();
  const highlight = state.highlight;
  const active = highlight.departments.length > 0 || highlight.agents.length > 0 || highlight.work.length > 0;
  const dim = (isOn: boolean) => (active && !isOn ? "opacity-40" : "");

  return (
    <section aria-labelledby="organization-heading" className="px-4 pb-2 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>The organization</Eyebrow>
          <h2 id="organization-heading" className="mt-1.5 text-lg font-semibold text-ink">
            Everyone the Executive Agent is coordinating
          </h2>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
          Founder <span aria-hidden>→</span> Executive Agent <span aria-hidden>→</span> Departments{" "}
          <span aria-hidden>→</span> AI employees <span aria-hidden>→</span> Work
        </p>
      </div>

      {/* What the Executive Agent, or a selection, put a spotlight on. */}
      {highlight.label ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-brand-soft bg-brand-tint px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand-ink">Highlighted</span>
          <p className="min-w-0 flex-1 text-2xs text-ink">{highlight.label}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: "clear-selection" })}
            className={`rounded-md border border-hairline bg-surface-white px-2 py-1 text-2xs font-medium text-ink transition-colors hover:bg-surface-secondary ${FOCUS}`}
          >
            Clear highlight
          </button>
        </div>
      ) : null}

      {/* The founder, above the organization they direct. */}
      <div className="mt-5 flex flex-col items-center">
        <div className="inline-flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-white px-3 py-2">
          <Initials name={state.company.founderName} />
          <span className="text-2xs">
            <span className="font-semibold text-ink">You</span>
            <span className="text-ink-muted"> · {state.company.founderName}, founder</span>
          </span>
          <span className="hidden text-2xs text-ink-faint sm:inline">Sets direction, approves, unblocks</span>
        </div>
        <span className="h-5 w-px bg-hairline-strong" aria-hidden />
      </div>

      {/* The Executive Agent: the one strong brand moment on the board. */}
      <div className={`rounded-xl bg-brand-deep px-4 py-3.5 text-on-brand sm:px-5 ${dim(active ? true : true)}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-on-brand/12 text-2xs font-bold" aria-hidden>
            EA
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              Executive Agent
              <span className="inline-flex items-center gap-1.5 rounded-md bg-on-brand/12 px-2 py-0.5 text-2xs font-medium">
                <span className="size-1.5 rounded-full bg-on-ink" aria-hidden />
                Online
              </span>
            </h3>
            <p className="mt-0.5 text-2xs text-on-brand/80">
              Delegates every work item, keeps departments in their mandate, and escalates only what a human must
              decide.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <dl className="hidden items-center gap-4 sm:flex">
              {[
                { label: "Departments", value: counts.departments },
                { label: "In flight", value: counts.activeWork },
                { label: "Need you", value: counts.attention },
              ].map((item) => (
                <div key={item.label}>
                  <dd className="text-sm font-semibold tabular-nums">{item.value}</dd>
                  <dt className="text-3xs font-medium uppercase tracking-[0.14em] text-on-brand/70">{item.label}</dt>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={onFocusEa}
              className={`rounded-lg bg-surface-white px-3 py-2 text-2xs font-semibold text-brand-deep transition-colors hover:bg-brand-soft ${FOCUS}`}
            >
              Ask the Executive Agent
            </button>
          </div>
        </div>
      </div>

      {/* The bus: the Executive Agent fans out into departments. */}
      <div className="flex justify-center">
        <span className="h-5 w-px bg-hairline-strong" aria-hidden />
      </div>
      <div className="h-px w-full bg-hairline" aria-hidden />

      <ul className="grid gap-x-8 gap-y-8 pt-1 sm:grid-cols-2 xl:grid-cols-3">
        {state.departments.map((department) => (
          <DepartmentColumn
            key={department.id}
            department={department}
            dim={dim}
            onHireInto={onHireInto}
            highlight={highlight}
            onSelect={(selection) => dispatch({ type: "select", selection })}
            selection={state.selection}
          />
        ))}
      </ul>
    </section>
  );
}

function DepartmentColumn({
  department,
  dim,
  highlight,
  onSelect,
  onHireInto,
  selection,
}: {
  department: Department;
  dim: (isOn: boolean) => string;
  highlight: { departments: string[]; agents: string[]; work: string[] };
  onSelect: (selection: { kind: "department"; id: string } | { kind: "agent"; id: string } | { kind: "work"; id: string }) => void;
  onHireInto: (departmentId: string) => void;
  selection: { kind: string; id: string } | null;
}) {
  const { state } = usePrototype();
  const [expanded, setExpanded] = useState(false);
  /** Whoever needs a human first, so a blocked employee is never behind "more". */
  const urgency: Record<Status, number> = {
    blocked: 0,
    waiting: 1,
    paused: 2,
    review: 3,
    working: 4,
    active: 5,
    offline: 6,
    done: 7,
  };
  const agents = state.agents
    .filter((a) => a.departmentId === department.id)
    .slice()
    .sort((a, b) => urgency[a.status] - urgency[b.status]);
  const work = state.work.filter((w) => w.departmentId === department.id);
  const status = aggregateStatus(agents);
  const departmentOn = highlight.departments.includes(department.id);
  const shown = expanded ? agents : agents.slice(0, 4);
  const hidden = agents.length - shown.length;
  const distribution = STATUS_ORDER.filter((s) => agents.some((a) => a.status === s));

  return (
    <li className={`relative min-w-0 pt-5 transition-opacity duration-200 ${dim(departmentOn)}`}>
      <span className="absolute left-4 top-0 h-5 w-px bg-hairline" aria-hidden />
      <button
        type="button"
        onClick={() => onSelect({ kind: "department", id: department.id })}
        aria-pressed={selection?.kind === "department" && selection.id === department.id}
        className={`group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-secondary ${FOCUS}`}
      >
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border text-text-brand ${
            departmentOn ? "border-brand-soft bg-brand-tint" : "border-hairline bg-surface-white"
          }`}
        >
          <DepartmentIcon department={department} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{department.name}</span>
            <StatusChip status={status} size="xs" />
          </span>
          <span className="mt-0.5 block truncate text-2xs text-ink-muted">{department.purpose}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-2xs font-semibold tabular-nums text-ink">{agents.length}</span>
          <span className="block text-3xs text-ink-faint">AI employees</span>
        </span>
      </button>

      {/* Status mix, so "who needs me here" is readable without opening anything. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
          {work.length} in flight
        </span>
        {distribution.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 text-3xs text-ink-muted">
            <span className={`size-1.5 rounded-full ${STATUS_META[s].dot}`} aria-hidden />
            {agents.filter((a) => a.status === s).length} {STATUS_META[s].label.toLowerCase()}
          </span>
        ))}
      </div>

      <div className="mt-3 border-t border-hairline">
        {agents.length === 0 ? (
          <div className="px-2 py-4">
            <p className="flex items-center gap-1.5 text-2xs text-ink-muted">
              <Users className="h-3.5 w-3.5" aria-hidden />
              No AI employees yet
            </p>
            <Button variant="ghost" className="mt-1 px-0 hover:bg-transparent" onClick={() => onHireInto(department.id)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Hire the first one
            </Button>
          </div>
        ) : (
          shown.map((agent) => {
            const agentWork = state.work.find((w) => w.id === agent.workId);
            const agentOn = highlight.agents.length === 0 || highlight.agents.includes(agent.id);
            const workOn = agentWork ? highlight.work.length === 0 || highlight.work.includes(agentWork.id) : true;
            const selected = selection?.kind === "agent" && selection.id === agent.id;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelect({ kind: "agent", id: agent.id })}
                aria-pressed={selected}
                className={`flex w-full items-start gap-2.5 border-t border-hairline px-2 py-2.5 text-left transition-colors first:border-t-0 hover:bg-surface-secondary ${FOCUS} ${
                  selected ? "bg-brand-tint" : ""
                } ${dim(agentOn && workOn)}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-2xs font-semibold text-ink">{agent.name}</span>
                    <span className="truncate text-2xs text-ink-muted">{agent.role}</span>
                    <span className="ml-auto">
                      <StatusChip status={agent.status} size="xs" />
                    </span>
                  </span>
                  {/* With tracked work the work line is the focus. Without it, the standing duty is. */}
                  {!agentWork ? (
                    <span className="mt-0.5 block truncate text-2xs text-ink-muted">{agent.focus}</span>
                  ) : null}
                  {agentWork ? (
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate text-2xs text-ink-muted">{agentWork.title}</span>
                      {agentWork.progress ? (
                        <Steps
                          done={agentWork.progress.done}
                          total={agentWork.progress.total}
                          unit={agentWork.progress.unit}
                        />
                      ) : null}
                      {agentWork.status !== agent.status ? <StatusChip status={agentWork.status} size="xs" /> : null}
                    </span>
                  ) : null}
                  {agent.mode === "autonomous" ? (
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                      Autonomous
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
              </button>
            );
          })
        )}
      </div>

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`mt-2 px-2 text-2xs font-medium text-text-brand transition-colors hover:underline ${FOCUS}`}
        >
          + {hidden} more in {department.name}
        </button>
      ) : null}
    </li>
  );
}
