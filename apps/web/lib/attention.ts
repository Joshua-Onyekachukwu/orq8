/**
 * Founder's Attention types shared by the proxy route, hook, badge and page.
 *
 * These mirror `apps/api/src/services/attention.ts`. The API owns the shape;
 * this module only adds presentation constants (labels, links, tones) so the
 * web never invents an item the API did not produce.
 */

export type AttentionSeverity = "critical" | "warning" | "info";

export type AttentionSource =
  | "approval"
  | "permission"
  | "blocked_work"
  | "failure"
  | "credits"
  | "deadline"
  | "escalation";

export interface AttentionAction {
  kind: "approve" | "reject" | "retry" | "pause" | "cancel" | "acknowledge" | "ask_ea";
  label: string;
  /** API path; the web proxy is derived from it (see proxyPathFor). */
  endpoint?: string;
  method?: "PATCH" | "POST";
  payload?: Record<string, unknown>;
  /** Starter prompt for the Executive Agent panel (ask_ea only). */
  prompt?: string;
}

export interface AttentionItem {
  id: string;
  source: AttentionSource;
  severity: AttentionSeverity;
  what: string;
  why: string;
  who: string | null;
  authority: string;
  impact: string | null;
  next: string;
  entity: { type: string; id: string };
  createdAt: string;
  dueAt: string | null;
  actions: AttentionAction[];
}

export interface AttentionSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  bySource: Record<AttentionSource, number>;
}

export interface AttentionSnapshot {
  items: AttentionItem[];
  summary: AttentionSummary;
  generatedAt: string;
  quiet: boolean;
  truncated: boolean;
}

export const ATTENTION_SEVERITY_ORDER: AttentionSeverity[] = ["critical", "warning", "info"];

export const ATTENTION_SEVERITY_LABELS: Record<AttentionSeverity, string> = {
  critical: "Critical",
  warning: "Needs a decision",
  info: "For information",
};

export const ATTENTION_SEVERITY_DESCRIPTIONS: Record<AttentionSeverity, string> = {
  critical: "Blocking work or money right now.",
  warning: "Slowing the company down and getting worse with time.",
  info: "Worth knowing; no action is strictly required today.",
};

/** Two font weights only: semibold for the label, regular for the body. */
export const ATTENTION_SEVERITY_PILL: Record<AttentionSeverity, string> = {
  critical: "bg-red-50 text-red-700",
  warning: "bg-orq8-orange/10 text-orq8-orange",
  info: "bg-canvas text-muted",
};

export const ATTENTION_SEVERITY_ACCENT: Record<AttentionSeverity, string> = {
  critical: "border-l-red-400",
  warning: "border-l-orq8-orange",
  info: "border-l-hairline",
};

export const ATTENTION_SOURCE_LABELS: Record<AttentionSource, string> = {
  approval: "Approval",
  permission: "Permission",
  blocked_work: "Blocked work",
  failure: "Failed work",
  credits: "Work Credits",
  deadline: "Deadline",
  escalation: "Council escalation",
};

/** Where the founder can see the underlying record. */
export const ATTENTION_SOURCE_HREFS: Record<AttentionSource, string> = {
  approval: "/app/approvals",
  permission: "/app/approvals",
  blocked_work: "/app/goals",
  failure: "/app/goals",
  credits: "/app/budgets",
  deadline: "/app/goals",
  escalation: "/app/council",
};

/** Map an API path (/v1/...) onto the same-origin proxy (/api/...). */
export function proxyPathFor(endpoint: string): string {
  return endpoint.replace(/^\/v1(?=\/)/, "/api");
}

/** Time waiting, rendered from the item's real createdAt. */
export function waitingLabel(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `waiting ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `waiting ${hours}h`;
  const days = Math.floor(hours / 24);
  return `waiting ${days}d`;
}
