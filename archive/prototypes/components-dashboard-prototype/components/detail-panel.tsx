"use client";

import React from "react";
import { Check, MessageSquarePlus, X } from "lucide-react";

import { usePrototype } from "../state/store";
import { STATUS_META } from "../types";
import { AuthorityChip, Button, DepartmentIcon, Eyebrow, KindChip, ModeChip, StatusChip, Steps } from "./ui";

type Props = {
  onAsk: (text: string) => void;
  onHireInto: (departmentId: string) => void;
  onCreateWork: (departmentId: string) => void;
};

/**
 * The focus panel sticks to the top of the operating hub rather than covering
 * the Executive Agent, so a selection never hides the conversation.
 */
export function DetailPanel({ onAsk, onHireInto, onCreateWork }: Props) {
  const { state, dispatch } = usePrototype();
  const selection = state.selection;
  if (!selection) return null;

  const close = () => dispatch({ type: "clear-selection" });

  return (
    <div className="sticky top-0 z-20 border-b border-hairline bg-brand-tint/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{renderDetail()}</div>
        <button
          type="button"
          onClick={close}
          aria-label="Close the detail panel"
          className="rounded-lg border border-hairline bg-surface-white p-1.5 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );

  function renderDetail() {
    if (!selection) return null;

    if (selection.kind === "department") {
      const department = state.departments.find((d) => d.id === selection.id);
      if (!department) return null;
      const agents = state.agents.filter((a) => a.departmentId === department.id);
      const work = state.work.filter((w) => w.departmentId === department.id);
      const stuck = work.filter((w) => w.status === "blocked" || w.status === "waiting");
      return (
        <div>
          <Eyebrow>Department</Eyebrow>
          <h2 className="mt-1 flex items-center gap-2 text-md font-semibold text-ink">
            <span className="flex size-7 items-center justify-center rounded-lg border border-hairline bg-surface-white text-text-brand">
              <DepartmentIcon department={department} className="h-3.5 w-3.5" />
            </span>
            {department.name}
          </h2>
          <p className="mt-1 max-w-2xl text-2sm text-ink-muted">{department.purpose}</p>
          <div className="mt-2 grid gap-1">
            <p className="text-2xs text-ink-muted">
              <span className="font-medium text-ink">Mandate:</span> {department.mandate}
            </p>
            <p className="text-2xs text-ink-muted">
              <span className="font-medium text-ink">Created:</span> {department.createdAt}
              {department.simulated ? " · added in this prototype session" : ""}
            </p>
            <p className="text-2xs text-ink-muted">
              {agents.length} AI employees · {work.length} work items in flight
              {stuck.length > 0 ? ` · ${stuck.length} waiting or blocked` : ""}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => onHireInto(department.id)}>Hire into {department.name}</Button>
            <Button onClick={() => onCreateWork(department.id)}>Create work here</Button>
            <Button
              variant="ghost"
              onClick={() => onAsk(`What is ${department.name} working on?`)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
              Ask the Executive Agent
            </Button>
          </div>
          {agents.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "select", selection: { kind: "agent", id: agent.id } })}
                    className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-white px-2 py-1 text-2xs text-ink transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)]"
                  >
                    <span className={`size-1.5 rounded-full ${STATUS_META[agent.status].dot}`} aria-hidden />
                    {agent.name}
                    <span className="text-ink-faint">{agent.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-hairline bg-surface-white px-3 py-2 text-2xs text-ink-muted">
              No AI employees yet. Hiring one puts it to work inside this department's mandate.
            </p>
          )}
        </div>
      );
    }

    if (selection.kind === "agent") {
      const agent = state.agents.find((a) => a.id === selection.id);
      if (!agent) return null;
      const department = state.departments.find((d) => d.id === agent.departmentId);
      const work = state.work.find((w) => w.id === agent.workId);
      return (
        <div>
          <Eyebrow>AI employee</Eyebrow>
          <h2 className="mt-1 text-md font-semibold text-ink">
            {agent.name}
            <span className="font-normal text-ink-muted"> · {agent.role}</span>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={agent.status} />
            <ModeChip mode={agent.mode} />
            {agent.authority.map((a) => (
              <AuthorityChip key={a} authority={a} />
            ))}
            {agent.simulated ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                hired in this session
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-2sm text-ink">{agent.focus}</p>
          <div className="mt-2 grid gap-1">
            {department ? (
              <p className="text-2xs text-ink-muted">
                <span className="font-medium text-ink">Department:</span>{" "}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "select", selection: { kind: "department", id: department.id } })}
                  className="underline decoration-hairline-strong underline-offset-2 hover:text-ink"
                >
                  {department.name}
                </button>
              </p>
            ) : null}
            <p className="text-2xs text-ink-muted">
              <span className="font-medium text-ink">Hired:</span> {agent.hiredAt}
            </p>
            {work ? (
              <p className="text-2xs text-ink-muted">
                <span className="font-medium text-ink">Tracked work:</span> {work.title}
                {work.progress ? (
                  <span className="ml-2 inline-flex align-middle">
                    <Steps done={work.progress.done} total={work.progress.total} unit={work.progress.unit} />
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-2xs text-ink-muted">No tracked work item. Standing duties only.</p>
            )}
            {work?.blockedReason ? <p className="text-2xs text-error-ink">{work.blockedReason}</p> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => onAsk(`What is ${agent.name} working on?`)}>
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
              Ask what {agent.name} is doing
            </Button>
            {work ? (
              <Button variant="ghost" onClick={() => dispatch({ type: "select", selection: { kind: "work", id: work.id } })}>
                Open the work item
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    if (selection.kind === "work") {
      const item = state.work.find((w) => w.id === selection.id);
      if (!item) return null;
      const department = state.departments.find((d) => d.id === item.departmentId);
      const agent = state.agents.find((a) => a.id === item.agentId);
      const attention = state.attention.find((a) => a.workId === item.id);
      return (
        <div>
          <Eyebrow>Work item</Eyebrow>
          <h2 className="mt-1 text-md font-semibold text-ink">{item.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={item.status} />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              {department?.name} · from {item.origin}
            </span>
          </div>
          <div className="mt-2 grid gap-1">
            <p className="text-2xs text-ink-muted">
              <span className="font-medium text-ink">Owner:</span>{" "}
              {agent ? `${agent.name}, ${agent.role.toLowerCase()}` : "Unassigned"} · started {item.startedAt}
            </p>
            {item.progress ? (
              <p className="flex items-center gap-2 text-2xs text-ink-muted">
                <span className="font-medium text-ink">Progress:</span>
                <Steps done={item.progress.done} total={item.progress.total} unit={item.progress.unit} />
              </p>
            ) : null}
            {item.blockedReason ? (
              <p className="max-w-2xl text-2xs text-error-ink">
                <span className="font-medium">Blocked:</span> {item.blockedReason}
              </p>
            ) : null}
          </div>
          {attention ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border-error bg-error-soft px-3 py-2">
              <KindChip kind={attention.kind} />
              <p className="min-w-0 flex-1 text-2xs text-ink">{attention.title}</p>
              <Button variant="primary" onClick={() => dispatch({ type: "resolve", id: attention.id, decision: "approved" })}>
                <Check className="h-3.5 w-3.5" aria-hidden />
                Approve
              </Button>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => onAsk(`Show me blocked work`)}>
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
              Ask about blockers
            </Button>
            {agent ? (
              <Button variant="ghost" onClick={() => dispatch({ type: "select", selection: { kind: "agent", id: agent.id } })}>
                Open {agent.name}
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    const item = state.attention.find((a) => a.id === selection.id);
    if (!item) return null;
    const department = state.departments.find((d) => d.id === item.departmentId);
    const work = state.work.find((w) => w.id === item.workId);
    const agent = state.agents.find((a) => a.id === item.agentId);
    return (
      <div>
        <Eyebrow>Approval</Eyebrow>
        <h2 className="mt-1 text-md font-semibold text-ink">{item.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <KindChip kind={item.kind} />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            {department?.name} · raised {item.raisedAt}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-2sm text-ink-muted">{item.detail}</p>
        <div className="mt-2 grid gap-1">
          <p className="text-2xs text-ink-muted">
            <span className="font-medium text-ink">Why it needs you:</span> {item.reason}
          </p>
          <p className="text-2xs text-ink-muted">
            <span className="font-medium text-ink">Requested by:</span> {item.requestedBy}
            {item.costCredits !== null ? ` · costs ${item.costCredits} credits` : ""}
          </p>
          {work ? (
            <p className="text-2xs text-ink-muted">
              <span className="font-medium text-ink">Holds up:</span> {work.title}
              {agent ? ` (${agent.name}, currently ${STATUS_META[agent.status].label.toLowerCase()})` : ""}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-2xs text-ink-faint">
          Approving unblocks the work, sets the AI employee back to working, and records the decision in company
          memory.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => dispatch({ type: "resolve", id: item.id, decision: "approved" })}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Approve
          </Button>
          <Button variant="danger" onClick={() => dispatch({ type: "resolve", id: item.id, decision: "rejected" })}>
            Reject
          </Button>
          <Button variant="ghost" onClick={() => onAsk(`What does approving "${item.title}" change?`)}>
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
            Ask the Executive Agent
          </Button>
        </div>
      </div>
    );
  }
}
