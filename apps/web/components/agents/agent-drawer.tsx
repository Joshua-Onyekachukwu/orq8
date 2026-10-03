"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Drawer } from "../layout/drawer";

/**
 * The agent detail drawer (brief §5). Opened from the dashboard's
 * "What's happening now" cards; the dashboard stays visible behind it.
 *
 * Every field here comes from the same endpoints the full employee page reads
 * (GET /v1/agents/:id, /v1/tasks, /v1/activity, /v1/tools/role/:role,
 * /v1/providers) through the web proxy routes, so the drawer can never show a
 * different story than the employee's own workspace. Nothing is invented: if
 * the API has no rows, the section says so.
 */

export type DrawerDotState = "" | "working" | "waiting" | "blocked";

/** The slice of dashboard state the drawer needs to open against. */
export interface AgentDrawerTarget {
  id: string;
  name: string;
  stateLabel: string;
  dotState: DrawerDotState;
  currentTask: string | null;
  /** What the founder is being asked, when this employee has an open gate. */
  approvalAction?: string | null;
}

interface DrawerAgent {
  id: string;
  name: string;
  role: string;
  department?: string | null;
  departmentName?: string | null;
  teamName?: string | null;
  status: string;
  autonomyLevel?: string;
  weeklyCost?: number;
  tasksCompleted?: number;
  tasksFailed?: number;
  creditsUsed?: number;
  currentTask?: string | null;
  capabilities?: string[];
  authority?: {
    canCreateTasks?: boolean;
    canExecuteTasks?: boolean;
    canAccessCompanyInfo?: boolean;
    canCommunicateExternally?: boolean;
    canModifyResources?: boolean;
    spendingLimitCents?: number;
    requiresApprovalFor?: string[];
    forbiddenActions?: string[];
  };
  createdAt?: string;
  lastActiveAt?: string | null;
}

interface DrawerTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  createdAt?: string;
}

interface DrawerEvent {
  id: number;
  type: string;
  summary: string;
  reason?: string | null;
  cost?: number;
  occurredAt: string;
}

interface DrawerTool {
  id: string;
  name: string;
  description?: string;
  category?: string;
  riskLevel?: string;
  requiresApproval?: boolean;
}

interface DrawerProvider {
  slug: string;
  name: string;
  connected: boolean;
  default_models?: string[];
}

interface DrawerData {
  agent: DrawerAgent;
  activity: DrawerEvent[];
  tasks: DrawerTask[];
  tools: DrawerTool[];
  providers: DrawerProvider[];
}

/** Proxy responses keep the API's `{ data }` envelope; unwrap either shape. */
async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T } | T;
    const shaped = body as { data?: T };
    return shaped?.data ?? (body as T);
  } catch {
    return null;
  }
}

function humanRole(role: string): string {
  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventTag(type: string): { tag: string; color: string } {
  const t = type.toLowerCase();
  if (t.includes("fail") || t.includes("block") || t.includes("denied")) {
    return { tag: "FAILED", color: "var(--orq-error)" };
  }
  if (t.includes("approv") || t.includes("gate") || t.includes("waiting")) {
    return { tag: "GATE", color: "var(--orq-warm)" };
  }
  if (t.includes("complet") || t.includes("done") || t.includes("success")) {
    return { tag: "DONE", color: "var(--orq-mark-active)" };
  }
  const first = t.split(/[^a-z]+/).filter(Boolean)[0] ?? "event";
  return { tag: first.toUpperCase().slice(0, 9), color: "var(--orq-text-secondary)" };
}

const TASK_TONE: Record<string, string> = {
  in_progress: "text-brand-ink",
  pending: "text-muted",
  awaiting_approval: "text-warm-ink",
  failed: "text-error-ink",
  completed: "text-muted",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h3>
  );
}

function AuthorityRow({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${allowed ? "bg-mark-active" : "bg-hairline-strong"}`}
      />
      <span className={allowed ? "text-ink" : "text-muted"}>{label}</span>
      <span className="ml-auto font-mono text-2xs uppercase tracking-wide text-muted">
        {allowed ? "can" : "cannot"}
      </span>
    </li>
  );
}

export function AgentDrawer({
  target,
  onClose,
}: {
  target: AgentDrawerTarget | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DrawerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const agentId = target?.id ?? null;

  useEffect(() => {
    if (!agentId) {
      setData(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      const agent = await getJson<DrawerAgent>(`/api/agents/${agentId}`, controller.signal);
      if (controller.signal.aborted) return;
      if (!agent) {
        setError("This employee's record could not be loaded from the API.");
        setLoading(false);
        return;
      }
      const [activity, tasks, tools, providers] = await Promise.all([
        getJson<DrawerEvent[]>(`/api/activity?agent_id=${agentId}&limit=8`, controller.signal),
        getJson<DrawerTask[]>(`/api/tasks?agent_id=${agentId}&order=desc&limit=25`, controller.signal),
        getJson<DrawerTool[]>(
          `/api/tools?role=${encodeURIComponent(agent.role)}`,
          controller.signal,
        ),
        getJson<DrawerProvider[]>("/api/providers", controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setData({
        agent,
        activity: activity ?? [],
        tasks: tasks ?? [],
        tools: tools ?? [],
        providers: providers ?? [],
      });
      setLoading(false);
    })().catch(() => {
      if (!controller.signal.aborted) {
        setError("This employee's record could not be loaded from the API.");
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [agentId, reloadKey]);

  const agent = data?.agent;
  const openTasks = (data?.tasks ?? []).filter(
    (t) => t.status === "in_progress" || t.status === "awaiting_approval" || t.status === "pending",
  );
  const delivered = (data?.tasks ?? []).filter((t) => t.status === "completed").slice(0, 3);
  const authority = agent?.authority;
  const connected = (data?.providers ?? []).filter((p) => p.connected);

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-canvas text-xs font-semibold text-ink"
          >
            {(target?.name ?? "?").charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{target?.name ?? "Employee"}</span>
          <span
            className="state-dot"
            data-state={target?.dotState ?? ""}
            title={target?.stateLabel}
          />
          <span className="font-mono text-2xs uppercase tracking-wide text-muted">
            {target?.stateLabel}
          </span>
        </span>
      }
      subtitle={
        agent
          ? [humanRole(agent.role), agent.departmentName ?? agent.department, agent.teamName]
              .filter(Boolean)
              .join(" · ")
          : "Loading…"
      }
      headerRight={
        <Link
          href={`/app/agents/${target?.id ?? ""}`}
          className="inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-2xs text-muted transition-colors hover:text-ink"
        >
          Full profile
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      }
    >
      {loading && !data ? (
        <div className="space-y-4" aria-busy="true">
          <div className="h-4 w-32 animate-pulse rounded bg-surface-secondary" />
          <div className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
          <div className="h-4 w-40 animate-pulse rounded bg-surface-secondary" />
          <div className="h-32 animate-pulse rounded-lg bg-surface-secondary" />
          <p className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading {target?.name}&apos;s record…
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-hairline px-4 py-5">
          <p className="flex items-center gap-2 text-sm text-ink">
            <AlertTriangle className="h-4 w-4 text-warm-ink" />
            {error}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Doing now — the one thing the drawer must answer */}
          <section className="rounded-lg border border-hairline bg-canvas p-3.5">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Doing now</SectionLabel>
              {agent?.lastActiveAt && (
                <span className="font-mono text-2xs text-muted">
                  active {timeAgo(agent.lastActiveAt)}
                </span>
              )}
            </div>
            {agent?.currentTask ? (
              <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
                {agent.currentTask}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {target?.stateLabel === "Working"
                  ? "Marked working, but no task text is recorded."
                  : `${target?.stateLabel ?? "No state"} — nothing is running for this employee right now.`}
              </p>
            )}
            {target?.approvalAction && (
              <div className="mt-3 rounded-md border border-hairline-strong bg-warm-soft px-3 py-2">
                <p className="text-xs text-ink">
                  Waiting on your decision: {target.approvalAction}
                </p>
                <Link
                  href="/app/approvals"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-wide text-warm-ink hover:underline"
                >
                  Review the gate
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </section>

          {/* Identity + real counters */}
          <section>
            <SectionLabel>Identity</SectionLabel>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted">Role</dt>
                <dd className="text-ink">{agent ? humanRole(agent.role) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Department</dt>
                <dd className="text-ink">
                  {agent?.departmentName ?? agent?.department ?? "Unassigned"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Team</dt>
                <dd className="text-ink">{agent?.teamName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="text-ink capitalize">{agent?.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Autonomy</dt>
                <dd className="text-ink">
                  {(agent?.autonomyLevel ?? "—").replace(/_/g, " ")}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tasks done</dt>
                <dd className="text-ink tabular-nums">
                  {agent?.tasksCompleted ?? 0}
                  {(agent?.tasksFailed ?? 0) > 0 && (
                    <span className="ml-1 text-error-ink">· {agent?.tasksFailed} failed</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {/* Current work — real task rows */}
          <section>
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Current work</SectionLabel>
              <span className="font-mono text-2xs text-muted">
                {openTasks.length} open
              </span>
            </div>
            {openTasks.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                No open tasks. This employee picks up work when the founder or Atlas assigns it.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {openTasks.slice(0, 6).map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/app/tasks/${task.id}`}
                      className="flex items-center gap-2 rounded-md border border-hairline bg-elevated px-3 py-2 transition-colors hover:border-hairline-strong"
                    >
                      <span
                        className={`font-mono text-2xs uppercase tracking-wide ${TASK_TONE[task.status] ?? "text-muted"}`}
                      >
                        {task.status.replace(/_/g, " ")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">
                        {task.title}
                      </span>
                      <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-muted">
                        {task.priority}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent activity — the same events the feed shows */}
          <section>
            <SectionLabel>Recent activity</SectionLabel>
            {data?.activity.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No events recorded for this employee yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {(data?.activity ?? []).map((event) => {
                  const tag = eventTag(event.type);
                  return (
                    <li key={event.id} className="flex items-baseline gap-2 text-2xs">
                      <span className="shrink-0 font-mono text-muted">
                        {clock(event.occurredAt)}
                      </span>
                      <span className="w-14 shrink-0 font-mono font-semibold" style={{ color: tag.color }}>
                        {tag.tag}
                      </span>
                      <span className="min-w-0 flex-1 text-muted">
                        {event.summary}
                        {event.reason && <span className="text-muted"> — {event.reason}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {delivered.length > 0 && (
            <section>
              <SectionLabel>Recently delivered</SectionLabel>
              <ul className="mt-2 space-y-1.5">
                {delivered.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-mark-active" />
                    <Link
                      href={`/app/tasks/${task.id}`}
                      className="min-w-0 flex-1 truncate text-ink hover:text-brand-ink"
                    >
                      {task.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Abilities — the same resolver the execution path uses */}
          <section>
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" /> Abilities
                </span>
              </SectionLabel>
              <span className="font-mono text-2xs text-muted">{data?.tools.length ?? 0} tools</span>
            </div>
            {data?.tools.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No tools are mapped to this role.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(data?.tools ?? []).slice(0, 10).map((tool) => (
                  <li
                    key={tool.id}
                    title={tool.description ?? undefined}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-2xs text-ink"
                  >
                    {tool.name}
                    {tool.requiresApproval && (
                      <span className="font-mono uppercase tracking-wide text-warm-ink">gate</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Authority */}
          <section>
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" /> Authority
              </span>
            </SectionLabel>
            <ul className="mt-2 space-y-1.5">
              <AuthorityRow label="Create tasks" allowed={!!authority?.canCreateTasks} />
              <AuthorityRow label="Execute tasks" allowed={!!authority?.canExecuteTasks} />
              <AuthorityRow label="Access company info" allowed={!!authority?.canAccessCompanyInfo} />
              <AuthorityRow
                label="Communicate externally"
                allowed={!!authority?.canCommunicateExternally}
              />
              <AuthorityRow label="Modify resources" allowed={!!authority?.canModifyResources} />
            </ul>
            {(authority?.requiresApprovalFor?.length ?? 0) > 0 && (
              <p className="mt-2 text-2xs text-muted">
                Always needs the founder: {(authority?.requiresApprovalFor ?? []).join(", ").replace(/_/g, " ")}.
              </p>
            )}
            {(authority?.forbiddenActions?.length ?? 0) > 0 && (
              <p className="mt-1 text-2xs text-muted">
                Cannot: {(authority?.forbiddenActions ?? []).join(", ").replace(/_/g, " ")}.
              </p>
            )}
            {(authority?.spendingLimitCents ?? 0) > 0 && (
              <p className="mt-1 text-2xs text-muted">
                Spending limit: ${((authority?.spendingLimitCents ?? 0) / 100).toFixed(2)}.
              </p>
            )}
          </section>

          {/* Model routing — the real provider catalog, not a claim */}
          <section>
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="h-3 w-3" /> Model routing
              </span>
            </SectionLabel>
            {connected.length === 0 ? (
              <p className="mt-2 text-2xs text-muted">
                No provider keys are connected for this workspace, so tasks run on ORQ8&apos;s
                configured providers.{" "}
                <Link href="/settings/providers" className="underline hover:text-ink">
                  Connect your own
                </Link>
                .
              </p>
            ) : (
              <p className="mt-2 text-2xs text-muted">
                {`${connected.length} workspace provider${connected.length === 1 ? "" : "s"} connected: ${connected
                  .map((p) => p.name)
                  .join(", ")}. Work is routed per task through ORQ8's provider chain.`}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-hairline px-3.5 py-3">
            <p className="flex items-center gap-2 text-2xs text-muted">
              <Activity className="h-3.5 w-3.5" />
              Created {agent?.createdAt ? clock(agent.createdAt) : "—"}
              {agent?.creditsUsed !== undefined && (
                <span className="ml-auto inline-flex items-center gap-1 font-mono">
                  <Clock3 className="h-3 w-3" />
                  {agent.creditsUsed} credits used
                </span>
              )}
            </p>
          </section>
        </div>
      )}
    </Drawer>
  );
}
