"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Command,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Target,
} from "lucide-react";
import { useExecutiveAgent, usePageContext } from "../executive-agent-context";
import {
  AuthorityPanel,
  authorityDirty,
  titleize,
  type AgentAuthority,
} from "./authority-panel";

/**
 * The employee workspace (docs/71 §H). Everything on this screen reads or
 * writes a real record:
 *
 *   identity + status   → agents row (+ the agent's own task rows)
 *   authority bands     → agents.authority, written via PATCH /v1/agents/:id
 *   skills              → agents.capabilities (context + delegation matching)
 *   abilities/tools     → GET /v1/tools/role/:role (the runtime's own resolver)
 *   memory              → GET /v1/agent-memory?agentId= (the runtime's store)
 *   work + cost         → tasks, activity and credits the employee actually used
 *
 * The one §H item deliberately absent is a per-employee model pin: there is no
 * persisted model field on an employee, so a picker here would be a control
 * that lies. Auto Model is shown as the truth it is — the router decides per
 * task — instead.
 */

export interface EmployeeAgent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  departmentName?: string | null;
  teamName?: string | null;
  status: string;
  autonomyLevel?: string;
  weeklyCost: number;
  tasksCompleted: number;
  tasksFailed?: number;
  creditsUsed?: number;
  currentTask: string | null;
  capabilities: string[];
  authority: AgentAuthority;
  createdAt: string;
  lastActiveAt?: string | null;
  retiredAt?: string | null;
  updatedAt?: string;
}

export interface EmployeeTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  cost: number;
  createdAt: string;
}

export interface EmployeeActivity {
  id: number;
  type: string;
  summary: string;
  reason?: string | null;
  cost: number;
  occurredAt: string;
}

export interface EmployeeMemoryEntry {
  id: string;
  category: string;
  content: string;
  importance: number;
  createdAt: string;
}

export interface EmployeeTool {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: string;
  creditCost: number;
  requiresApproval?: boolean;
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "authority", label: "Authority" },
  { key: "abilities", label: "Abilities" },
  { key: "memory", label: "Memory" },
  { key: "work", label: "Work & cost" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type DotState = "" | "working" | "waiting" | "blocked";

function formatCost(cents: number): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatTimeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/** Status vocabulary (docs/71 §H), derived from the employee's own rows. */
export function employeeState(
  agent: EmployeeAgent,
  tasks: EmployeeTask[],
): { label: string; state: DotState; hint: string } {
  if (agent.status === "archived" || agent.retiredAt) {
    return { label: "Retired", state: "", hint: "Archived — kept for history, cannot be given work." };
  }
  if (agent.status !== "active") {
    return { label: "Paused", state: "", hint: "Paused by you — it will not pick up new work." };
  }
  const running = tasks.filter((t) => t.status === "in_progress");
  if (running.length > 0) {
    return { label: "Working", state: "working", hint: `Running “${running[0]!.title}”.` };
  }
  const waiting = tasks.filter((t) => t.status === "awaiting_approval");
  if (waiting.length > 0) {
    return {
      label: "Needs you",
      state: "waiting",
      hint: `${waiting.length} task${waiting.length === 1 ? "" : "s"} stopped for your decision.`,
    };
  }
  // Only the newest task decides "blocked". A failure from an hour ago that the
  // employee has already moved past is history, not its current state — reading
  // any failure in the list as "blocked" would label most employees blocked
  // forever. Tasks arrive newest-first.
  const latest = tasks[0];
  if (latest && latest.status === "failed") {
    return {
      label: "Blocked",
      state: "blocked",
      hint: `Last task failed — “${latest.title}”.`,
    };
  }
  return { label: "Idle", state: "", hint: "Active and available; nothing is queued for it." };
}

function taskDot(status: string): DotState {
  if (status === "in_progress") return "working";
  if (status === "awaiting_approval") return "waiting";
  if (status === "failed") return "blocked";
  return "";
}

const RISK_TONE: Record<string, string> = {
  low: "text-muted",
  medium: "text-ink",
  high: "text-warm-ink",
  critical: "text-error-ink",
};

export function EmployeeWorkspace({
  agent,
  tasks,
  activity,
  memory,
  tools,
  providers,
}: {
  agent: EmployeeAgent;
  tasks: EmployeeTask[];
  activity: EmployeeActivity[];
  memory: EmployeeMemoryEntry[];
  tools: EmployeeTool[];
  providers: Array<{ slug: string; name: string; connected: boolean; default_models: string[] }>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("overview");

  // Editable copies, re-synced only when the record actually changes.
  const [draft, setDraft] = useState<AgentAuthority>(agent.authority);
  const [autonomy, setAutonomy] = useState(agent.autonomyLevel ?? "execute_with_approval");
  const [skills, setSkills] = useState<string[]>(agent.capabilities ?? []);
  const [name, setName] = useState(agent.name);
  const [renaming, setRenaming] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { openPanel } = useExecutiveAgent();
  usePageContext({
    route: `/app/agents/${agent.id}`,
    pageName: `Employee — ${agent.name}`,
    entity: { type: "agent", id: agent.id, name: agent.name, status: agent.status },
    extra: { role: agent.role, department: agent.departmentName ?? agent.department ?? "unassigned" },
  });

  useEffect(() => {
    setDraft(agent.authority);
    setAutonomy(agent.autonomyLevel ?? "execute_with_approval");
    setSkills(agent.capabilities ?? []);
    setName(agent.name);
  }, [agent.id, agent.updatedAt]);

  const status = useMemo(() => employeeState(agent, tasks), [agent, tasks]);
  const authorityChanged = authorityDirty(agent.authority, draft) || autonomy !== (agent.autonomyLevel ?? "execute_with_approval");
  const skillsChanged =
    skills.length !== (agent.capabilities ?? []).length ||
    skills.some((s, i) => s !== (agent.capabilities ?? [])[i]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const patch = useCallback(
    async (body: Record<string, unknown>, label: string, success: string) => {
      setBusy(label);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/agents/${agent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
        }
        setNotice(success);
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The change could not be saved.");
      } finally {
        setBusy(null);
      }
    },
    [agent.id, refresh],
  );

  const toolsByCategory = useMemo(() => {
    const groups = new Map<string, EmployeeTool[]>();
    for (const tool of tools) {
      const key = tool.category || "general";
      groups.set(key, [...(groups.get(key) ?? []), tool]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tools]);

  const connectedProviders = providers.filter((p) => p.connected);
  const costThisWeek = agent.weeklyCost ?? 0;

  return (
    <div className="space-y-4">
      <Link
        href="/app/agents"
        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
      >
        ← All employees
      </Link>

      {(error || notice) && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 ${
            error ? "border-error-soft bg-error-soft/40" : "border-hairline-strong bg-elevated"
          }`}
        >
          {error ? (
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" />
          ) : (
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" />
          )}
          <p className={`text-sm ${error ? "text-error-ink" : "text-ink"}`}>{error ?? notice}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
            className="ml-auto text-2xs text-muted transition-colors hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <header className="console-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-hairline bg-elevated text-lg font-semibold text-ink"
            >
              {agent.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                {(agent.departmentName ?? agent.department ?? "Unassigned").toUpperCase()}
                {agent.teamName ? ` · ${agent.teamName}` : ""}
              </p>
              {renaming ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    value={name}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && name.trim()) {
                        setRenaming(false);
                        void patch({ name: name.trim() }, "rename", "Name updated.");
                      }
                      if (e.key === "Escape") {
                        setName(agent.name);
                        setRenaming(false);
                      }
                    }}
                    className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-lg text-ink focus:border-hairline-strong focus:outline-none"
                    aria-label="Employee name"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(false);
                      void patch({ name: name.trim() }, "rename", "Name updated.");
                    }}
                    disabled={!name.trim() || busy === "rename"}
                    className="inline-flex items-center gap-1 rounded-md border border-hairline-strong px-2.5 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setName(agent.name);
                      setRenaming(false);
                    }}
                    className="text-xs text-muted transition-colors hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-ink">
                  {agent.name}
                </h1>
              )}
              <p className="mt-0.5 text-sm text-muted">{agent.role.replace(/_/g, " ")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-2xs text-ink">
                  <span className="state-dot" data-state={status.state} />
                  {status.label}
                </span>
                <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-2xs uppercase tracking-wide text-muted">
                  {autonomy.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-2xs text-muted">
                  last active {formatTimeAgo(agent.lastActiveAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void patch(
                  { status: agent.status === "active" ? "paused" : "active" },
                  "status",
                  agent.status === "active" ? "Employee paused." : "Employee resumed.",
                )
              }
              disabled={busy === "status" || agent.status === "archived"}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-40"
            >
              {busy === "status" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : agent.status === "active" ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {agent.status === "active" ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => openPanel(`What is ${agent.name} working on right now?`)}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
            >
              <Command aria-hidden="true" className="h-3.5 w-3.5" />
              Ask Atlas
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">{status.hint}</p>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-5">
          {[
            { label: "Tasks completed", value: String(agent.tasksCompleted ?? 0) },
            { label: "Tasks failed", value: String(agent.tasksFailed ?? 0) },
            { label: "Credits used", value: String(agent.creditsUsed ?? 0) },
            { label: "Cost this week", value: formatCost(costThisWeek) },
            { label: "Hired", value: formatDate(agent.createdAt) },
          ].map((stat) => (
            <div key={stat.label} className="bg-canvas px-3.5 py-2.5">
              <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                {stat.label}
              </dt>
              <dd className="mt-0.5 text-sm tabular-nums text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          const badge =
            t.key === "memory" && memory.length > 0
              ? memory.length
              : t.key === "abilities" && tools.length > 0
                ? tools.length
                : null;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-hairline-strong bg-elevated text-ink"
                  : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
              }`}
            >
              {t.label}
              {badge !== null && <span className="ml-1.5 font-mono text-2xs text-muted">{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="console-card p-4 lg:col-span-2">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Now
            </h2>
            {(() => {
              const running = tasks.filter((t) => t.status === "in_progress");
              const waiting = tasks.filter((t) => t.status === "awaiting_approval");
              if (running.length === 0 && waiting.length === 0) {
                return (
                  <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
                    <p className="text-sm text-ink">Nothing running.</p>
                    <p className="mt-1 text-xs text-muted">
                      Ask Atlas to brief this employee, or queue work from the Tasks board — it picks
                      up work through its department, never on its own schedule.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          openPanel(
                            `Brief ${agent.name} (${agent.role.replace(/_/g, " ")}) on what to work on next.`,
                          )
                        }
                        className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                      >
                        Ask Atlas to brief {agent.name}
                      </button>
                      <Link
                        href="/app/tasks"
                        className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                      >
                        Open Tasks
                      </Link>
                    </div>
                  </div>
                );
              }
              return (
                <ul className="mt-2 space-y-1.5">
                  {[...running, ...waiting].map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center gap-2.5 rounded-md border border-hairline px-3 py-2.5"
                    >
                      <span className="state-dot" data-state={taskDot(task.status)} />
                      <Link
                        href={`/app/tasks/${task.id}`}
                        className="min-w-0 flex-1 truncate text-sm text-ink hover:text-brand-ink"
                      >
                        {task.title}
                      </Link>
                      <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                        {task.status.replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </section>

          <section className="console-card p-4">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Model routing
            </h2>
            <p className="mt-2 text-sm text-ink">Auto Model</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              The router picks per task from the company&apos;s connected providers using the task&apos;s
              intelligence, cost and context requirements — there is no per-employee pin to configure.
            </p>
            <div className="mt-3 space-y-1.5">
              <p className="font-mono text-2xs uppercase tracking-wide text-muted">
                Connected providers
              </p>
              {connectedProviders.length === 0 ? (
                <p className="text-xs text-muted">
                  No provider is connected yet.{" "}
                  <Link href="/app/integrations" className="text-ink underline-offset-2 hover:underline">
                    Connect one
                  </Link>{" "}
                  to give this employee a model to run on.
                </p>
              ) : (
                <ul className="space-y-1">
                  {connectedProviders.map((p) => (
                    <li key={p.slug} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="text-ink">{p.name}</span>
                      <span className="font-mono text-2xs text-muted">
                        {p.default_models.slice(0, 2).join(", ") || "no default model listed"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="console-card p-4">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Autonomy
            </h2>
            <p className="mt-2 text-sm text-ink">{titleize(autonomy)}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {autonomy === "observe"
                ? "Reads and researches only — it cannot execute work."
                : autonomy === "recommend"
                  ? "Executes internally; results come to you as recommendations."
                  : autonomy === "draft"
                    ? "May draft external content, never sends it."
                    : autonomy === "autonomous"
                      ? "Executes within its authority and budget without asking."
                      : "Consequential actions stop for your approval."}
            </p>
            <button
              type="button"
              onClick={() => setTab("authority")}
              className="mt-3 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
            >
              Change authority & autonomy
            </button>
          </section>
        </div>
      )}

      {/* ── Authority ────────────────────────────────────────────────────── */}
      {tab === "authority" && (
        <AuthorityPanel
          authority={draft}
          autonomyLevel={autonomy}
          dirty={authorityChanged}
          saving={busy === "authority"}
          onDraftChange={setDraft}
          onAutonomyChange={setAutonomy}
          onDiscard={() => {
            setDraft(agent.authority);
            setAutonomy(agent.autonomyLevel ?? "execute_with_approval");
          }}
          onSave={() =>
            void patch(
              { authority: draft, autonomyLevel: autonomy },
              "authority",
              "Authority saved — it applies to this employee's next action.",
            )
          }
        />
      )}

      {/* ── Abilities ────────────────────────────────────────────────────── */}
      {tab === "abilities" && (
        <div className="space-y-3">
          <section className="console-card p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Skills
              </h2>
              <p className="ml-auto text-2xs text-muted">
                written into this employee&apos;s working context
              </p>
            </div>
            {skills.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed border-hairline px-3 py-3 text-xs text-muted">
                No skills listed. Add the ones this role actually has — they decide which work the
                company routes here.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li
                    key={skill}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong px-2.5 py-1 text-2xs text-ink"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => setSkills(skills.filter((s) => s !== skill))}
                      className="text-muted transition-colors hover:text-ink"
                      aria-label={`Remove ${skill}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <SkillAdder onAdd={(skill) => setSkills([...skills, skill])} existing={skills} />
            {skillsChanged && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void patch({ capabilities: skills }, "skills", "Skills saved.")}
                  disabled={busy === "skills"}
                  className="inline-flex items-center gap-1.5 rounded-md bg-warm px-3 py-1.5 text-xs font-semibold text-on-warm transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy === "skills" ? "Saving…" : "Save skills"}
                </button>
                <button
                  type="button"
                  onClick={() => setSkills(agent.capabilities ?? [])}
                  className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                >
                  Discard
                </button>
              </div>
            )}
          </section>

          <section className="console-card p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Tools this role can run
              </h2>
              <p className="ml-auto text-2xs text-muted">
                {tools.length} available to {agent.role.replace(/_/g, " ")}
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Resolved by the same registry the execution path uses. Authority above still applies —
              a tool marked &ldquo;needs you&rdquo; stops for approval even when the role can run it.
            </p>
            {tools.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-hairline px-3 py-3 text-xs text-muted">
                This role has no tools registered.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {toolsByCategory.map(([category, group]) => (
                  <div key={category}>
                    <p className="font-mono text-2xs uppercase tracking-wide text-muted">{category}</p>
                    <ul className="mt-1.5 divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
                      {group.map((tool) => (
                        <li key={tool.id} className="flex items-start gap-3 bg-canvas px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-ink">{tool.name}</p>
                            <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                              {tool.description}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {tool.requiresApproval && (
                              <span className="inline-flex items-center gap-1.5 text-2xs text-warm-ink">
                                <span className="state-dot" data-state="waiting" />
                                needs you
                              </span>
                            )}
                            <span
                              className={`font-mono text-2xs uppercase tracking-wide ${
                                RISK_TONE[tool.riskLevel] ?? "text-muted"
                              }`}
                            >
                              {tool.riskLevel}
                            </span>
                            <span className="font-mono text-2xs tabular-nums text-muted">
                              {tool.creditCost} cr
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Memory ───────────────────────────────────────────────────────── */}
      {tab === "memory" && <MemoryTab agentId={agent.id} agentName={agent.name} initial={memory} />}

      {/* ── Work & cost ──────────────────────────────────────────────────── */}
      {tab === "work" && (
        <div className="space-y-3">
          <section className="console-card p-4">
            <div className="flex items-baseline gap-2">
              <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Tasks
              </h2>
              <p className="ml-auto text-2xs text-muted">{tasks.length} on record</p>
            </div>
            {tasks.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-hairline px-3 py-6 text-center text-xs text-muted">
                No work has been routed to this employee yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-hairline">
                <table className="w-full">
                  <thead>
                    <tr className="bg-canvas text-left">
                      {["Task", "Status", "Priority", "Due", "Cost"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3.5 py-2 font-mono text-3xs font-semibold uppercase tracking-wide text-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {tasks.map((task) => (
                      <tr key={task.id} className="bg-canvas/60 transition-colors hover:bg-surface-secondary">
                        <td className="px-3.5 py-2.5">
                          <Link
                            href={`/app/tasks/${task.id}`}
                            className="text-sm text-ink hover:text-brand-ink"
                          >
                            {task.title}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <span className="state-dot" data-state={taskDot(task.status)} />
                            {task.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-2xs uppercase text-muted">
                          {task.priority}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted">
                          {task.dueDate ? formatDate(task.dueDate) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-xs tabular-nums text-muted">
                          {formatCost(task.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="console-card p-4">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Activity
            </h2>
            {activity.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-hairline px-3 py-6 text-center text-xs text-muted">
                Nothing recorded yet.
              </p>
            ) : (
              <ol className="mt-3 space-y-1">
                {activity.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-hairline px-1 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-sm text-ink">{event.summary}</span>
                    <span className="font-mono text-2xs text-muted">
                      {event.type.replace(/_/g, " ")}
                      {event.cost > 0 ? ` · ${formatCost(event.cost)}` : ""} ·{" "}
                      {formatTimeAgo(event.occurredAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SkillAdder({ existing, onAdd }: { existing: string[]; onAdd: (skill: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const next = value.trim();
    if (!next || existing.includes(next)) return;
    onAdd(next);
    setValue("");
  };
  return (
    <div className="mt-2 flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a skill (e.g. competitive analysis)…"
        className="min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim()}
        className="inline-flex items-center gap-1 rounded-md border border-hairline-strong px-2.5 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-40"
      >
        <Plus className="h-3 w-3" /> Add
      </button>
    </div>
  );
}

const MEMORY_CATEGORIES = [
  "lesson",
  "preference",
  "pattern",
  "relationship",
  "technique",
  "context",
  "feedback",
] as const;

function MemoryTab({
  agentId,
  agentName,
  initial,
}: {
  agentId: string;
  agentName: string;
  initial: EmployeeMemoryEntry[];
}) {
  const router = useRouter();
  // The entries render straight from props: `router.refresh()` re-renders the
  // server component and hands over the new list. Mirroring them into state would
  // need an effect keyed on an array that is rebuilt on every render, which is an
  // infinite update loop — the exact trap the page context hook had.
  const entries = initial;
  const [category, setCategory] = useState<string>("context");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const visible = filter === "all" ? entries : entries.filter((e) => e.category === filter);

  const add = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, category, content: content.trim(), importance }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `Could not save (${res.status})`);
      }
      setContent("");
      setImportance(5);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this memory.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="console-card p-4">
        <div className="flex items-baseline gap-2">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            What {agentName} knows
          </h2>
          <p className="ml-auto text-2xs text-muted">{entries.length} remembered</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          The same store the runtime hands this employee before a task — lessons from finished work,
          failures, preferences and context. Anything you add here shapes its next run.
        </p>

        {entries.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-hairline px-3 py-6 text-center text-xs text-muted">
            Nothing remembered yet. It learns from its own tasks, or you can teach it below.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["all", ...MEMORY_CATEGORIES].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilter(c)}
                  aria-pressed={filter === c}
                  className={`rounded-full border px-2.5 py-0.5 text-2xs transition-colors ${
                    filter === c
                      ? "border-hairline-strong bg-elevated text-ink"
                      : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-1.5">
              {visible.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-hairline bg-canvas px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                      {entry.category}
                    </span>
                    <span className="ml-auto font-mono text-2xs tabular-nums text-muted">
                      importance {entry.importance}/10 · {formatTimeAgo(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink">{entry.content}</p>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="rounded-md border border-dashed border-hairline px-3 py-4 text-center text-xs text-muted">
                  Nothing in this category.
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      <section className="console-card p-4">
        <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Teach it something
        </h2>
        {error && (
          <p className="mt-2 flex items-center gap-2 text-xs text-error-ink">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" /> {error}
          </p>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
          <label className="text-2xs uppercase tracking-wide text-muted">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs normal-case tracking-normal text-ink focus:border-hairline-strong focus:outline-none"
            >
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-canvas text-ink">
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-2xs uppercase tracking-wide text-muted">
            Memory
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder={`Something ${agentName} should carry into its next task…`}
              className="mt-1 w-full resize-y rounded-md border border-hairline bg-canvas px-2.5 py-2 text-xs normal-case tracking-normal leading-relaxed text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-2xs uppercase tracking-wide text-muted">
            Importance
            <input
              type="range"
              min={1}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-28 accent-[var(--orq-mark-active)]"
            />
            <span className="font-mono text-2xs tabular-nums text-ink">{importance}/10</span>
          </label>
          <button
            type="button"
            onClick={() => void add()}
            disabled={saving || !content.trim()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-warm px-3 py-1.5 text-xs font-semibold text-on-warm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Remember this"}
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => router.refresh()}
        className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
      >
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        Refresh memory
      </button>
    </div>
  );
}
