/**
 * Prototype vocabulary and entity types.
 *
 * Isolated from production: nothing here is imported by the app shell or any
 * existing dashboard component. The status, authority and mode sets mirror the
 * shipped system exactly (docs/65_COLOR_SYSTEM.md, /design/colors) so the
 * prototype cannot invent a parallel vocabulary.
 *
 * Every status is glyph + word + colour. The colour class strings are written
 * out in full on purpose: Tailwind only sees literal class names, so a
 * `bg-status-${x}-bg` template string would compile to nothing.
 */

export type Status =
  | "active"
  | "working"
  | "waiting"
  | "blocked"
  | "review"
  | "done"
  | "paused"
  | "offline";

export type StatusMeta = {
  label: string;
  glyph: string;
  /** Chip: the documented filled pair, safe for all eight states. */
  chip: string;
  /** Dot: the solid mark tone, readable on white where the chip tone is not. */
  dot: string;
};

export const STATUS_META: Record<Status, StatusMeta> = {
  active: { label: "Active", glyph: "●", chip: "bg-status-active-bg text-status-active-text", dot: "bg-mark-active" },
  working: { label: "Working", glyph: "◍", chip: "bg-status-working-bg text-status-working-text", dot: "bg-brand" },
  waiting: { label: "Waiting", glyph: "!", chip: "bg-status-waiting-bg text-status-waiting-text", dot: "bg-mark-warm" },
  blocked: { label: "Blocked", glyph: "✕", chip: "bg-status-blocked-bg text-status-blocked-text", dot: "bg-error-fill" },
  review: { label: "Review", glyph: "◐", chip: "bg-status-review-bg text-status-review-text", dot: "bg-mark-active" },
  done: { label: "Done", glyph: "✓", chip: "bg-status-done-bg text-status-done-text", dot: "bg-brand" },
  paused: { label: "Paused", glyph: "Ⅱ", chip: "bg-status-paused-bg text-status-paused-text", dot: "bg-mark-active" },
  offline: { label: "Offline", glyph: "—", chip: "bg-status-offline-bg text-status-offline-text", dot: "bg-ink" },
};

export const STATUS_ORDER: Status[] = [
  "working",
  "active",
  "waiting",
  "review",
  "blocked",
  "paused",
  "done",
  "offline",
];

/** Working and available: the states an operation is normally running in. */
export const LIVE_STATUSES: Status[] = ["working", "active"];

export type Mode = "manual" | "assisted" | "autonomous";

export const MODE_META: Record<Mode, { label: string; chip: string }> = {
  manual: { label: "Manual", chip: "border-mode-manual-border bg-mode-manual-bg text-mode-manual-text" },
  assisted: { label: "Assisted", chip: "border border-transparent bg-mode-assisted-bg text-mode-assisted-text" },
  autonomous: { label: "Autonomous", chip: "border border-transparent bg-mode-autonomous-bg text-mode-autonomous-text" },
};

export type Authority = "can" | "spend" | "approval" | "cannot";

export const AUTHORITY_META: Record<Authority, { label: string; chip: string }> = {
  can: { label: "Can do", chip: "bg-authority-can-bg text-authority-can-text" },
  spend: { label: "Can spend", chip: "bg-authority-spend-bg text-authority-spend-text" },
  approval: { label: "Requires approval", chip: "bg-authority-approval-bg text-authority-approval-text" },
  cannot: { label: "Cannot do", chip: "bg-authority-cannot-bg text-authority-cannot-text" },
};

export type DepartmentId = string;
export type AgentId = string;
export type WorkId = string;
export type AttentionId = string;

export type Department = {
  id: DepartmentId;
  name: string;
  /** One line on why the department exists. */
  purpose: string;
  /** Icon key resolved in the component layer (never a colour per department). */
  icon: "product" | "engineering" | "marketing" | "sales" | "success" | "finance" | "operations" | "custom";
  /** Plain language mandate the department works inside. */
  mandate: string;
  createdAt: string;
  simulated: boolean;
};

export type Agent = {
  id: AgentId;
  name: string;
  role: string;
  departmentId: DepartmentId;
  status: Status;
  mode: Mode;
  authority: Authority[];
  /** What this employee is doing right now, in one line. */
  focus: string;
  workId: WorkId | null;
  hiredAt: string;
  simulated: boolean;
};

export type WorkItem = {
  id: WorkId;
  title: string;
  departmentId: DepartmentId;
  agentId: AgentId;
  status: Status;
  /** Meaningful step count, never a fake percentage. */
  progress: { done: number; total: number; unit: string } | null;
  origin: "Executive Agent" | "Founder" | "Department" | "Company goal";
  startedAt: string;
  /** Present when status is blocked or waiting. */
  blockedReason?: string;
  simulated: boolean;
};

export type AttentionKind =
  | "approval"
  | "budget"
  | "decision"
  | "permission"
  | "blocked"
  | "failed"
  | "risk";

export const ATTENTION_KIND_LABEL: Record<AttentionKind, string> = {
  approval: "Approval required",
  budget: "Budget request",
  decision: "Decision required",
  permission: "Permission request",
  blocked: "Agent blocked",
  failed: "Task failed",
  risk: "Risk alert",
};

export type AttentionItem = {
  id: AttentionId;
  kind: AttentionKind;
  title: string;
  /** What the founder is actually deciding. */
  detail: string;
  /** Why it is waiting on a human. */
  reason: string;
  departmentId: DepartmentId;
  agentId: AgentId;
  workId: WorkId | null;
  requestedBy: string;
  costCredits: number | null;
  raisedAt: string;
  severity: "important" | "urgent";
  resolved?: "approved" | "rejected" | "delegated";
};

export type ActivityEvent = {
  id: string;
  at: string;
  actor: string;
  agentId: AgentId | null;
  departmentId: DepartmentId | null;
  workId: WorkId | null;
  text: string;
  kind: "work" | "decision" | "hire" | "structure" | "approval" | "blocked";
};

export type PriorityItem = {
  id: string;
  title: string;
  ownerDepartmentId: DepartmentId;
  status: Status;
  /** A step, not a percentage. */
  progress: string;
  target: string;
};

export type MemorySummary = {
  total: number;
  decisions: number;
  activePriorities: number;
  goals: number;
  recent: { id: string; at: string; text: string; kind: "decision" | "memory" | "goal" }[];
};

export type CompanyProfile = {
  name: string;
  stage: string;
  plan: string;
  mission: string;
  founderName: string;
  foundedAt: string;
  credits: { used: number; allowance: number; currency: string };
};

export type EaMessage = {
  id: string;
  from: "founder" | "ea";
  at: string;
  text: string;
  /** Effects the reply applied to the visible board, listed for the reviewer. */
  effectNote?: string;
  simulated: boolean;
};

export type Selection =
  | { kind: "department"; id: DepartmentId }
  | { kind: "agent"; id: AgentId }
  | { kind: "work"; id: WorkId }
  | { kind: "attention"; id: AttentionId }
  | null;

export type WorkFilter = "all" | "blocked" | "waiting" | "review" | "working";

/**
 * A selection or an Executive Agent answer can point at parts of the
 * organization. Everything the board highlights comes from here, so "select a
 * department" and "ask about a department" produce the same visual language.
 */
export type Highlight = {
  departments: DepartmentId[];
  agents: AgentId[];
  work: WorkId[];
  attention: AttentionId[];
  label: string | null;
};
