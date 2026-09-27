"use client";

/**
 * OrganizationHub — the live organizational centre of the Company Hub.
 *
 * The Executive Agent is the centre; departments form the first layer; AI
 * employees belong to their department and carry their real state. Everything
 * here is rendered from backend rows (docs/63), so hiring, assigning, blocking
 * or pausing changes what the founder sees.
 *
 * Selection is reported to the Executive Agent panel as page context, so the
 * panel can answer about whatever the founder is looking at.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { useExecutiveAgent } from "../executive-agent-context";
import { ago, Empty, StatusChip } from "./hub-ui";

export interface HubAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  currentTask: string | null;
  autonomyLevel: string | null;
  tools: string[];
  canExecuteTasks: boolean;
  canCreateTasks: boolean;
  canCommunicateExternally: boolean;
  creditsUsed: number;
  lastActiveAt: string | null;
}

export interface HubDepartment {
  id: string;
  name: string;
  description: string | null;
  head: string | null;
  budget: number | null;
  agents: HubAgent[];
}

export interface HubTaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  agentId: string | null;
  goalTitle: string | null;
  cost: number;
}

const DEPARTMENT_EMPLOYEE_LIMIT = 6;

function authorityLines(agent: HubAgent): string[] {
  const lines: string[] = [];
  lines.push(
    agent.canExecuteTasks
      ? `Executes tasks (${agent.autonomyLevel ?? "autonomy not set"})`
      : "Cannot execute tasks",
  );
  if (!agent.canCreateTasks) lines.push("Cannot create tasks");
  lines.push(
    agent.canCommunicateExternally
      ? "May communicate externally"
      : "Internal communication only",
  );
  return lines;
}

export function OrganizationHub({
  eaName,
  departments,
  unassigned,
  tasks,
  pendingApprovals,
  attentionCritical,
}: {
  eaName: string;
  departments: HubDepartment[];
  unassigned: HubAgent[];
  tasks: HubTaskSummary[];
  pendingApprovals: number;
  attentionCritical: number;
}) {
  const { openPanel, setPageContext } = useExecutiveAgent();
  const [selected, setSelected] = useState<{ type: "agent" | "department"; id: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allAgents = useMemo(
    () => [...departments.flatMap((d) => d.agents), ...unassigned],
    [departments, unassigned],
  );
  const counts = useMemo(() => {
    const by = (statuses: string[]) =>
      allAgents.filter((a) => statuses.includes((a.status ?? "").toLowerCase())).length;
    return {
      total: allAgents.length,
      working: by(["working", "executing", "in_progress"]),
      waiting: by(["waiting", "pending", "assigned"]),
      blocked: by(["blocked", "failed"]),
      review: by(["review"]),
      paused: by(["paused", "offline", "retired"]),
    };
  }, [allAgents]);

  const selectedAgent =
    selected?.type === "agent" ? allAgents.find((a) => a.id === selected.id) ?? null : null;
  const selectedDepartment =
    selected?.type === "department" ? departments.find((d) => d.id === selected.id) ?? null : null;
  const selectedDepartmentAgents = selectedDepartment?.agents ?? [];
  const selectedAgentTask = selectedAgent
    ? tasks.find((t) => t.agentId === selectedAgent.id) ?? null
    : null;

  const select = (type: "agent" | "department", entity: { id: string; name: string; status?: string }) => {
    setSelected({ type, id: entity.id });
    setPageContext({
      route: "/app/company/overview",
      pageName: "Company Overview",
      entity: { type, id: entity.id, name: entity.name, status: entity.status },
    });
  };

  const toggleDepartment = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Organization canvas */}
      <div>
        {/* Centre: the Executive Agent */}
        <div className="rounded-xl border border-orq8-green/30 bg-orq8-dark p-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-3xs uppercase tracking-[0.2em] text-white/50">
                Executive Agent
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">{eaName}</p>
              <p className="mt-1 text-2sm text-white/70">
                Coordinating {departments.length} department{departments.length === 1 ? "" : "s"} and{" "}
                {counts.total} AI employee{counts.total === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-4">
              <div>
                <p className="text-lg font-semibold tabular-nums">{counts.working}</p>
                <p className="text-3xs uppercase tracking-wide text-white/50">Working</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{counts.waiting}</p>
                <p className="text-3xs uppercase tracking-wide text-white/50">Waiting</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{counts.blocked}</p>
                <p className="text-3xs uppercase tracking-wide text-white/50">Blocked</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">{pendingApprovals}</p>
                <p className="text-3xs uppercase tracking-wide text-white/50">Approvals</p>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-2xs text-white/60">
            <span>
              {counts.review} in review · {counts.paused} paused
            </span>
            <span>
              {attentionCritical > 0
                ? `${attentionCritical} item${attentionCritical === 1 ? "" : "s"} critical for you`
                : "Nothing critical for you"}
            </span>
            <button
              type="button"
              onClick={() => openPanel("What is the state of my company right now?")}
              className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-2xs font-medium text-white/80 transition-colors hover:bg-white/10"
            >
              Ask {eaName}
            </button>
          </div>
        </div>

        {/* First layer: departments */}
        <div className="mt-4 space-y-3">
          {departments.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-4">
              <Empty>
                No departments yet. {eaName} can propose a structure, or add one under Organization →
                Departments.
              </Empty>
            </div>
          ) : null}

          {departments.map((dept) => {
            const isExpanded = expanded.has(dept.id) || dept.agents.length <= DEPARTMENT_EMPLOYEE_LIMIT;
            const shown = isExpanded ? dept.agents : [];
            const isSelected = selected?.type === "department" && selected.id === dept.id;
            const spend = tasks
              .filter((t) => dept.agents.some((a) => a.id === t.agentId))
              .reduce((sum, t) => sum + (t.cost ?? 0), 0);
            return (
              <div
                key={dept.id}
                className={`rounded-xl border bg-white p-3 transition-colors ${
                  isSelected ? "border-orq8-orange/50" : "border-hairline"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => select("department", { id: dept.id, name: dept.name })}
                    className="text-left"
                  >
                    <p className="text-sm font-semibold text-ink">{dept.name}</p>
                    <p className="text-2xs text-muted">
                      {dept.head ? `Head: ${dept.head} · ` : ""}
                      {dept.agents.length} AI employee{dept.agents.length === 1 ? "" : "s"}
                    </p>
                  </button>
                  <div className="flex items-center gap-4 text-2xs text-muted">
                    <span>
                      {dept.budget === null || dept.budget === undefined
                        ? "No budget set"
                        : `Budget ${(dept.budget / 100).toFixed(0)} · spent ${spend} credits`}
                    </span>
                    {dept.agents.length > DEPARTMENT_EMPLOYEE_LIMIT ? (
                      <button
                        type="button"
                        onClick={() => toggleDepartment(dept.id)}
                        className="inline-flex items-center gap-1 font-medium text-orq8-orange"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronDown className="h-3 w-3" /> Hide
                          </>
                        ) : (
                          <>
                            <ChevronRight className="h-3 w-3" /> Show {dept.agents.length}
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>

                {dept.agents.length === 0 ? (
                  <p className="mt-2 text-2xs text-muted">No employees assigned.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-hairline">
                    {shown.map((agent) => {
                      const agentSelected = selected?.type === "agent" && selected.id === agent.id;
                      return (
                        <li key={agent.id}>
                          <button
                            type="button"
                            onClick={() =>
                              select("agent", { id: agent.id, name: agent.name, status: agent.status })
                            }
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                              agentSelected ? "bg-orq8-orange/[0.07]" : "hover:bg-canvas"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-2sm font-medium text-ink">
                                {agent.name}
                              </span>
                              <span className="block truncate text-2xs text-muted">
                                {agent.role}
                                {agent.currentTask ? ` · ${agent.currentTask}` : ""}
                              </span>
                            </span>
                            <StatusChip status={agent.status} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {unassigned.length > 0 ? (
            <div className="rounded-xl border border-hairline bg-white p-3">
              <p className="text-sm font-semibold text-ink">Unassigned</p>
              <p className="text-2xs text-muted">
                {unassigned.length} AI employee{unassigned.length === 1 ? "" : "s"} not in a department
              </p>
              <ul className="mt-3 divide-y divide-hairline">
                {unassigned.map((agent) => (
                  <li key={agent.id}>
                    <button
                      type="button"
                      onClick={() => select("agent", { id: agent.id, name: agent.name, status: agent.status })}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-canvas"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-2sm font-medium text-ink">{agent.name}</span>
                        <span className="block truncate text-2xs text-muted">{agent.role}</span>
                      </span>
                      <StatusChip status={agent.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* Detail of whatever is selected */}
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="rounded-xl border border-hairline bg-white p-4">
          {!selected ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Users className="h-4 w-4 text-orq8-green" /> Your organization
              </p>
              <p className="mt-2 text-2sm text-muted">
                Select a department or an AI employee to see its real state, and {eaName} will follow
                what you are looking at.
              </p>
            </>
          ) : null}

          {selectedAgent ? (
            <>
              <p className="text-sm font-semibold text-ink">{selectedAgent.name}</p>
              <p className="text-2xs text-muted">{selectedAgent.role}</p>
              <div className="mt-2">
                <StatusChip status={selectedAgent.status} />
              </div>
              <dl className="mt-3 space-y-2 text-2sm">
                <div>
                  <dt className="text-2xs text-muted">Current task</dt>
                  <dd className="text-ink">{selectedAgent.currentTask ?? "None assigned"}</dd>
                </div>
                {selectedAgentTask ? (
                  <div>
                    <dt className="text-2xs text-muted">Task state</dt>
                    <dd className="flex items-center gap-2 text-ink">
                      <StatusChip status={selectedAgentTask.status} />
                      {selectedAgentTask.priority ? (
                        <span className="text-2xs text-muted">{selectedAgentTask.priority} priority</span>
                      ) : null}
                    </dd>
                    {selectedAgentTask.goalTitle ? (
                      <dd className="mt-1 text-2xs text-muted">Goal: {selectedAgentTask.goalTitle}</dd>
                    ) : null}
                    <dd className="mt-1 text-2xs text-muted">
                      {selectedAgentTask.cost} credit{selectedAgentTask.cost === 1 ? "" : "s"} charged so far
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-2xs text-muted">Authority</dt>
                  {authorityLines(selectedAgent).map((line) => (
                    <dd key={line} className="text-2xs text-ink">
                      {line}
                    </dd>
                  ))}
                </div>
                <div>
                  <dt className="text-2xs text-muted">Tools</dt>
                  <dd className="text-2xs text-ink">
                    {selectedAgent.tools.length ? selectedAgent.tools.join(", ") : "None configured"}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-muted">Execution</dt>
                  <dd className="text-2xs text-ink">
                    {selectedAgent.lastActiveAt
                      ? `Last active ${ago(selectedAgent.lastActiveAt)}`
                      : "No execution recorded"}
                    {selectedAgent.creditsUsed ? ` · ${selectedAgent.creditsUsed} credits used` : ""}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`/app/agents/${selectedAgent.id}`}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-2xs font-medium text-ink transition-colors hover:bg-canvas"
                >
                  Open employee
                </a>
                <button
                  type="button"
                  onClick={() =>
                    openPanel(
                      `${selectedAgent.name} (${selectedAgent.role}) is ${selectedAgent.status}. Why, and what can continue without my approval?`,
                    )
                  }
                  className="rounded-lg bg-orq8-orange px-3 py-1.5 text-2xs font-semibold text-white transition-colors hover:bg-orq8-orange-bright"
                >
                  Ask {eaName}
                </button>
              </div>
            </>
          ) : null}

          {selectedDepartment ? (
            <>
              <p className="text-sm font-semibold text-ink">{selectedDepartment.name}</p>
              <p className="mt-1 text-2sm text-muted">
                {selectedDepartment.description ?? "No description set."}
              </p>
              <dl className="mt-3 space-y-2 text-2sm">
                <div>
                  <dt className="text-2xs text-muted">Employees</dt>
                  <dd className="text-ink">
                    {selectedDepartmentAgents.length === 0
                      ? "None assigned"
                      : `${selectedDepartmentAgents.filter((a) => ["working", "executing", "in_progress", "active"].includes(a.status)).length} of ${selectedDepartmentAgents.length} active`}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-muted">Open work</dt>
                  <dd className="text-ink">
                    {
                      tasks.filter(
                        (t) =>
                          selectedDepartmentAgents.some((a) => a.id === t.agentId) &&
                          !["completed", "failed"].includes(t.status),
                      ).length
                    }{" "}
                    task(s) not finished
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-muted">Budget</dt>
                  <dd className="text-ink">
                    {selectedDepartment.budget === null || selectedDepartment.budget === undefined
                      ? "Not set"
                      : `${(selectedDepartment.budget / 100).toFixed(0)} set`}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`/app/departments/${selectedDepartment.id}`}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-2xs font-medium text-ink transition-colors hover:bg-canvas"
                >
                  Open department
                </a>
                <button
                  type="button"
                  onClick={() =>
                    openPanel(`What is ${selectedDepartment.name} working on, and is anything stuck?`)
                  }
                  className="rounded-lg bg-orq8-orange px-3 py-1.5 text-2xs font-semibold text-white transition-colors hover:bg-orq8-orange-bright"
                >
                  Ask {eaName}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
