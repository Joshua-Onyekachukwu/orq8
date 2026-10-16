import type { HappeningMember } from "./whats-happening";

/**
 * Org presence, derived once and shared (B6).
 *
 * The dashboard (live organization) and the company page (orbit console)
 * must agree on who is working / needs-you / blocked. Status is derived
 * from the employee's own rows, never invented: an archived employee is
 * retired, a paused one is paused, a pending approval addressed to them
 * means they need you, their newest event deciding "blocked" (so one old
 * failure cannot label someone blocked forever), a current task means
 * working, otherwise idle.
 */

export type DotState = "" | "working" | "waiting" | "blocked";

export interface PresenceAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  currentTask: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  department?: string | null;
  lastActiveAt?: string | null;
  tasksCompleted?: number;
  tasksFailed?: number;
  weeklyCost?: number;
}

export interface PresenceApproval {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
}

export interface PresenceEvent {
  id: number;
  agentId: string | null;
  taskId: string | null;
  type: string;
  summary: string;
  occurredAt: string;
}

/** Activity → the terminal's type tag and its colour (docs/73: colour = state). */
export function activityTag(type: string): { tag: string; color: string } {
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
  if (t.includes("tool")) return { tag: "TOOL", color: "var(--orq-text-secondary)" };
  if (t.includes("created") || t.includes("hired")) return { tag: "NEW", color: "var(--orq-text-secondary)" };
  if (t.includes("execut") || t.includes("run")) return { tag: "RUN", color: "var(--orq-text-secondary)" };
  if (t.includes("analyz")) return { tag: "ANALYZE", color: "var(--orq-text-secondary)" };
  if (t.includes("draft")) return { tag: "DRAFT", color: "var(--orq-text-secondary)" };
  if (t.includes("review")) return { tag: "REVIEW", color: "var(--orq-text-secondary)" };
  if (t.includes("paused")) return { tag: "PAUSED", color: "var(--orq-text-secondary)" };
  // Unknown types: the first word, uppercased — never a word cut in half
  // (a mid-word slice read as "EXECUTI" in the terminal).
  const firstWord = t.split(/[^a-z]+/).filter(Boolean)[0] ?? "event";
  return { tag: firstWord.toUpperCase().slice(0, 9), color: "var(--orq-text-secondary)" };
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function lastActiveLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Presence {
  members: HappeningMember[];
  working: number;
  waiting: number;
  blocked: number;
}

/**
 * Derive per-member presence plus the orbit counts. `departmentNameFor`
 * resolves an agent's department display name (dashboard passes its
 * department map; the company page passes rows directly).
 */
export function derivePresence(
  agentList: PresenceAgent[],
  approvalList: PresenceApproval[],
  events: PresenceEvent[],
  departmentNameFor?: (agent: PresenceAgent) => string | null,
  isLeadFor?: (agent: PresenceAgent) => boolean,
): Presence {
  const pendingApprovalAgentIds = new Set(
    approvalList.map((a) => a.agentId).filter((id): id is string => !!id),
  );
  const newestEventByAgent = new Map<string, PresenceEvent>();
  for (const event of events) {
    if (event.agentId && !newestEventByAgent.has(event.agentId)) {
      newestEventByAgent.set(event.agentId, event);
    }
  }
  const blockedAgentIds = new Set<string>();
  for (const [agentId, event] of newestEventByAgent) {
    if (activityTag(event.type).tag === "FAILED") blockedAgentIds.add(agentId);
  }

  function memberState(agent: PresenceAgent): { label: string; detail: string; state: DotState } {
    if (agent.status === "archived") return { label: "Retired", detail: "Retired", state: "" };
    if (agent.status !== "active") return { label: "Paused", detail: "Paused by you", state: "" };
    if (pendingApprovalAgentIds.has(agent.id)) {
      return { label: "Needs you", detail: "Waiting on approval", state: "waiting" };
    }
    if (blockedAgentIds.has(agent.id)) {
      const newest = newestEventByAgent.get(agent.id);
      // The event summary already names the failure ("Failed: Publish the
      // launch post"); repeating the tag reads as a stutter, so the tag is
      // stripped and the state dot carries it.
      const reason = newest
        ? newest.summary.replace(/^(failed|blocked|execution blocked):\s*/i, "")
        : null;
      return { label: "Blocked", detail: reason ?? "Blocked", state: "blocked" };
    }
    if (agent.currentTask) {
      return { label: "Working", detail: agent.currentTask, state: "working" };
    }
    return { label: "Idle", detail: "Idle", state: "" };
  }

  const approvalByAgent = new Map<string, PresenceApproval>();
  for (const approval of approvalList) {
    if (approval.agentId && !approvalByAgent.has(approval.agentId)) {
      approvalByAgent.set(approval.agentId, approval);
    }
  }

  const members: HappeningMember[] = agentList.map((agent) => {
    const info = memberState(agent);
    const newest = newestEventByAgent.get(agent.id) ?? null;
    const approval = approvalByAgent.get(agent.id) ?? null;
    const state: HappeningMember["state"] =
      info.label === "Needs you"
        ? "needs_you"
        : info.label === "Blocked"
          ? "blocked"
          : info.label === "Working"
            ? "working"
            : info.label === "Paused"
              ? "paused"
              : info.label === "Retired"
                ? "retired"
                : "idle";
    const tag = newest ? activityTag(newest.type) : null;
    // The terminal renderer strips the "<name>: " prefix because the row does
    // not repeat the employee; the card header does, so the same strip keeps
    // the summary from reading "Nova: Nova: …".
    const summary = newest
      ? newest.summary
          .replace(/^(failed|blocked|execution blocked):\s*/i, "")
          .replace(new RegExp(`^${agent.name}: `), "")
      : null;
    return {
      id: agent.id,
      name: agent.name,
      roleLabel: humanRole(agent.role),
      departmentName: departmentNameFor
        ? departmentNameFor(agent)
        : (agent.departmentName ?? agent.department ?? null),
      isLead: isLeadFor ? isLeadFor(agent) : false,
      state,
      stateLabel: info.label,
      dotState: info.state,
      currentTask: agent.currentTask ?? null,
      latestChange:
        newest && tag && summary
          ? {
              tag: tag.tag,
              color: tag.color,
              summary,
              clock: formatClock(newest.occurredAt),
            }
          : null,
      lastActiveLabel: lastActiveLabel(agent.lastActiveAt),
      tasksCompleted: agent.tasksCompleted ?? 0,
      tasksFailed: agent.tasksFailed ?? 0,
      weeklyCostLabel:
        (agent.weeklyCost ?? 0) > 0 ? `${(agent.weeklyCost ?? 0).toLocaleString()} credits/wk` : null,
      ask: approval
        ? `${approval.action}${approval.description ? ` — ${approval.description}` : ""}`
        : state === "blocked"
          ? info.detail
          : null,
      actionHref:
        state === "needs_you"
          ? "/app/approvals"
          : newest?.taskId
            ? `/app/tasks/${newest.taskId}`
            : null,
      actionLabel:
        state === "needs_you" ? "Review the gate" : state === "blocked" ? "Open the task" : null,
    };
  });

  return {
    members,
    working: members.filter((m) => m.state === "working").length,
    waiting: members.filter((m) => m.state === "needs_you").length,
    blocked: members.filter((m) => m.state === "blocked").length,
  };
}
