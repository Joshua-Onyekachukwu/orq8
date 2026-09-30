import type {
  Agent,
  AttentionItem,
  CompanyProfile,
  Department,
  Highlight,
  MemorySummary,
  PriorityItem,
  Selection,
  WorkFilter,
  WorkItem,
} from "../types";
import { STATUS_META } from "../types";

/**
 * SIMULATION. This module is the only place the prototype invents behaviour.
 *
 * It is a pure function: give it what the founder typed and the current board,
 * and it returns a reply plus an effect the board applies. It never calls the
 * ORQ8 API, never touches an agent runtime, and nothing in production imports
 * it. Every reply it produces is labelled as simulated in the panel.
 */

export type EaEffect =
  | { type: "highlight"; highlight: Highlight; filter?: WorkFilter }
  | { type: "open"; selection: Selection }
  | { type: "add-department"; name: string }
  | { type: "hire"; departmentId: string; name: string; role: string }
  | { type: "create-work"; departmentId: string; title: string }
  | { type: "none" };

export type EaReply = {
  text: string;
  effect: EaEffect;
  effectNote: string;
};

export type BoardContext = {
  company: CompanyProfile;
  departments: Department[];
  agents: Agent[];
  work: WorkItem[];
  attention: AttentionItem[];
  priorities: PriorityItem[];
  memory: MemorySummary;
};

const list = (items: string[], max = 5): string => {
  if (items.length === 0) return "nothing";
  if (items.length <= max) {
    if (items.length === 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
  }
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
};

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const byId = <T extends { id: string }>(rows: T[], id: string | null | undefined): T | undefined =>
  rows.find((row) => row.id === id);

const deptName = (ctx: BoardContext, id: string): string => byId(ctx.departments, id)?.name ?? "Unknown";

/** Match a department from free text: exact id, exact name, or a prefix of the name. */
function matchDepartment(ctx: BoardContext, text: string): Department | undefined {
  const t = text.toLowerCase();
  return ctx.departments.find((d) => t.includes(d.name.toLowerCase()) || new RegExp(`\\b${d.id}\\b`).test(t));
}

function matchAgent(ctx: BoardContext, text: string): Agent | undefined {
  const t = text.toLowerCase();
  return ctx.agents.find((a) => new RegExp(`\\b${a.name.toLowerCase()}\\b`).test(t));
}

const HIRE_POOL: Record<string, { name: string; role: string }[]> = {
  default: [
    { name: "Rosa", role: "Operations specialist" },
    { name: "Kai", role: "Analyst" },
    { name: "Leo", role: "Specialist" },
    { name: "Mira", role: "Coordinator" },
  ],
  engineering: [
    { name: "Nils", role: "Backend engineer" },
    { name: "Ada", role: "Platform engineer" },
  ],
  marketing: [
    { name: "Tess", role: "Content strategist" },
    { name: "Ivan", role: "Lifecycle marketer" },
  ],
  sales: [
    { name: "Marta", role: "Account executive" },
    { name: "Dev", role: "Sales development rep" },
  ],
  product: [
    { name: "Owen", role: "Product analyst" },
    { name: "Sana", role: "Designer" },
  ],
  success: [
    { name: "Ruth", role: "Onboarding specialist" },
    { name: "Paulo", role: "Support specialist" },
  ],
  finance: [
    { name: "Hedda", role: "Financial analyst" },
  ],
  operations: [
    { name: "Bruno", role: "Compliance analyst" },
  ],
};

const FALLBACK_HIRE = { name: "Rosa", role: "Operations specialist" };

function nextHire(ctx: BoardContext, departmentId: string): { name: string; role: string } {
  const pool = HIRE_POOL[departmentId] ?? HIRE_POOL["default"] ?? [];
  const taken = new Set(ctx.agents.map((a) => a.name));
  const free = pool.find((candidate) => !taken.has(candidate.name)) ?? pool[0] ?? FALLBACK_HIRE;
  if (!taken.has(free.name)) return free;
  let n = 2;
  while (taken.has(`${free.name} ${n}`)) n += 1;
  return { name: `${free.name} ${n}`, role: free.role };
}

const ALL_ATTENTION = (ctx: BoardContext): Highlight => ({
  departments: [],
  agents: [],
  work: [],
  attention: ctx.attention.map((a) => a.id),
  label: "Your attention queue",
});

function summarizeAttention(ctx: BoardContext): EaReply {
  const open = ctx.attention;
  if (open.length === 0) {
    return {
      text: "Nothing needs you. Every work item is either moving or waiting on another AI employee.",
      effect: { type: "highlight", highlight: ALL_ATTENTION(ctx) },
      effectNote: "Highlighted the empty attention queue.",
    };
  }
  const lines = open.map((item) => `${deptName(ctx, item.departmentId)}: ${item.title.toLowerCase()}`);
  return {
    text: `${count(open.length, "item")} need${open.length === 1 ? "s" : ""} you. ${list(lines)}.`,
    effect: { type: "highlight", highlight: ALL_ATTENTION(ctx) },
    effectNote: `Highlighted ${count(open.length, "attention item")}.`,
  };
}

function summarizeBlocked(ctx: BoardContext): EaReply {
  const blocked = ctx.work.filter((w) => w.status === "blocked");
  if (blocked.length === 0) {
    return {
      text: "Nothing is blocked. Two items are waiting on other people rather than on anything broken.",
      effect: { type: "highlight", highlight: { departments: [], agents: [], work: [], attention: [], label: "Blocked work" } },
      effectNote: "Cleared the filter.",
    };
  }
  const reason = blocked[0]?.blockedReason ?? "The blocker is recorded on the work item.";
  return {
    text: `${count(blocked.length, "work item")} blocked: ${list(
      blocked.map((w) => `${w.title} (${byId(ctx.agents, w.agentId)?.name ?? "unassigned"})`),
    )}. ${reason}`,
    effect: {
      type: "highlight",
      filter: "blocked",
      highlight: {
        departments: [...new Set(blocked.map((w) => w.departmentId))],
        agents: blocked.map((w) => w.agentId),
        work: blocked.map((w) => w.id),
        attention: [],
        label: "Blocked work",
      },
    },
    effectNote: `Filtered work to blocked and highlighted ${count(blocked.length, "work item")}.`,
  };
}

function summarizeWaiting(ctx: BoardContext): EaReply {
  const waiting = ctx.work.filter((w) => w.status === "waiting");
  if (waiting.length === 0) {
    return {
      text: "Nothing is waiting right now.",
      effect: { type: "highlight", highlight: { departments: [], agents: [], work: [], attention: [], label: null } },
      effectNote: "Cleared the filter.",
    };
  }
  return {
    text: `${count(waiting.length, "item")} waiting: ${list(
      waiting.map((w) => `${w.title} (${deptName(ctx, w.departmentId)}, ${byId(ctx.agents, w.agentId)?.name ?? "unassigned"})`),
    )}. Two of them are waiting on you rather than on another department.`,
    effect: {
      type: "highlight",
      filter: "waiting",
      highlight: {
        departments: [...new Set(waiting.map((w) => w.departmentId))],
        agents: waiting.map((w) => w.agentId),
        work: waiting.map((w) => w.id),
        attention: [],
        label: "Waiting work",
      },
    },
    effectNote: `Filtered work to waiting and highlighted ${count(waiting.length, "item")}.`,
  };
}

function summarizeCredits(ctx: BoardContext): EaReply {
  const { used, allowance } = ctx.company.credits;
  const requests = ctx.attention.filter((a) => a.costCredits !== null);
  const pending = requests.reduce((sum, a) => sum + (a.costCredits ?? 0), 0);
  const detail =
    requests.length > 0
      ? ` ${list(requests.map((a) => `${a.title.toLowerCase()} at ${a.costCredits} credits`))} is waiting on you, ${pending} credits in total.`
      : "";
  return {
    text: `You have spent ${used} of ${allowance} credits this month.${detail}`,
    effect: {
      type: "highlight",
      highlight: {
        departments: [],
        agents: [],
        work: [],
        attention: requests.map((a) => a.id),
        label: "Requests with a cost",
      },
    },
    effectNote: requests.length > 0 ? "Highlighted the requests that cost credits." : "No costed requests open.",
  };
}

function summarizePriorities(ctx: BoardContext): EaReply {
  const open = ctx.priorities;
  return {
    text: `Four priorities are open: ${list(
      open.map((p) => `${p.title} (${deptName(ctx, p.ownerDepartmentId)}, ${STATUS_META[p.status].label.toLowerCase()})`),
    )}. ${ctx.memory.decisions} decisions are recorded in company memory this month.`,
    effect: {
      type: "highlight",
      highlight: {
        departments: open.map((p) => p.ownerDepartmentId),
        agents: [],
        work: [],
        attention: [],
        label: "Departments carrying a priority",
      },
    },
    effectNote: "Highlighted the departments that own a priority.",
  };
}

function summarizeCompany(ctx: BoardContext): EaReply {
  const live = ctx.agents.filter((a) => a.status === "working" || a.status === "active").length;
  return {
    text: `${ctx.company.name} is operating. ${count(ctx.departments.length, "department")}, ${count(
      ctx.agents.length,
      "AI employee",
    )}, ${count(ctx.work.length, "work item")} in flight. ${live} employees are working or available, ${count(
      ctx.work.filter((w) => w.status === "blocked").length,
      "work item",
    )} blocked, and ${count(ctx.attention.length, "item")} waiting on you.`,
    effect: {
      type: "highlight",
      highlight: { departments: [], agents: [], work: [], attention: [], label: null },
      filter: "all",
    },
    effectNote: "Cleared the highlight and showed all work.",
  };
}

function summarizeDepartment(ctx: BoardContext, department: Department): EaReply {
  const agents = ctx.agents.filter((a) => a.departmentId === department.id);
  const work = ctx.work.filter((w) => w.departmentId === department.id);
  const blocked = work.filter((w) => w.status === "blocked" || w.status === "waiting");
  const lines = agents.map((a) => `${a.name} (${a.role}, ${STATUS_META[a.status].label.toLowerCase()})`);
  return {
    text: `${department.name} has ${count(agents.length, "AI employee")} and ${count(work.length, "work item")} in flight.${
      agents.length > 0 ? ` ${list(lines, 4)}.` : " No one is hired into it yet."
    }${blocked.length > 0 ? ` ${count(blocked.length, "item")} needs attention: ${blocked[0]?.title ?? ""}.` : ""}`,
    effect: {
      type: "highlight",
      highlight: {
        departments: [department.id],
        agents: agents.map((a) => a.id),
        work: work.map((w) => w.id),
        attention: [],
        label: `${department.name} and everything under it`,
      },
    },
    effectNote: `Highlighted ${department.name} with its ${count(agents.length, "AI employee")}.`,
  };
}

function summarizeAgent(ctx: BoardContext, agent: Agent): EaReply {
  const work = byId(ctx.work, agent.workId);
  const department = byId(ctx.departments, agent.departmentId);
  return {
    text: `${agent.name} is ${STATUS_META[agent.status].label.toLowerCase()} in ${
      department?.name ?? "an unknown department"
    }. ${agent.focus}.${work ? ` Tracked work: ${work.title}, ${work.progress?.done ?? 0} of ${work.progress?.total ?? 0} ${
      work.progress?.unit ?? "steps"
    }.` : " No tracked work item right now."}`,
    effect: {
      type: "open",
      selection: { kind: "agent", id: agent.id },
    },
    effectNote: `Opened ${agent.name} in the detail panel.`,
  };
}

function parseDepartmentName(text: string): string | null {
  const match = text.match(
    /(?:add|create|start|open|make|spin up)\s+(?:a\s+|an\s+|the\s+)?([a-z][a-z\s&-]{1,28}?)\s+department/i,
  );
  if (!match) return null;
  const name = (match[1] ?? "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  return name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function parseWorkTitle(text: string): string | null {
  const match = text.match(/(?:create|add|start|open)\s+(?:a\s+|an\s+|the\s+)?(?:work|task)\s*(?:item)?\s*(?:called|named|to|for|:)?\s*(.{3,80})/i);
  if (!match) return null;
  const value = (match[1] ?? "").trim().replace(/[.?!]+$/, "");
  return value.length > 2 ? value.charAt(0).toUpperCase() + value.slice(1) : null;
}

/**
 * The whole simulated brain: keyword intents over the live board. Deterministic
 * on purpose, so the same question always produces the same answer.
 */
export function respondTo(input: string, ctx: BoardContext): EaReply {
  const text = input.trim().toLowerCase();
  if (!text) {
    return { text: "Ask me anything about the company.", effect: { type: "none" }, effectNote: "Nothing changed." };
  }

  // Hiring
  if (/\bhire\b|\brecruit\b|new (ai )?(employee|teammate|agent)/.test(text)) {
    const department = matchDepartment(ctx, text) ?? ctx.departments[0];
    if (!department) {
      return {
        text: "There is no department to hire into yet. Add a department first.",
        effect: { type: "none" },
        effectNote: "Nothing changed.",
      };
    }
    const candidate = nextHire(ctx, department.id);
    return {
      text: `Hiring ${candidate.name} as ${candidate.role.toLowerCase()} into ${department.name}. I will start them on the department mandate and report back.`,
      effect: { type: "hire", departmentId: department.id, name: candidate.name, role: candidate.role },
      effectNote: `Added ${candidate.name} under ${department.name}.`,
    };
  }

  // New department
  const newDepartment = parseDepartmentName(input);
  if (newDepartment) {
    const exists = ctx.departments.some((d) => d.name.toLowerCase() === newDepartment.toLowerCase());
    if (exists) {
      return {
        text: `${newDepartment} already exists. I can hire into it instead.`,
        effect: { type: "none" },
        effectNote: "Nothing changed.",
      };
    }
    return {
      text: `Adding ${newDepartment} as a department. It will appear in the organization with an empty roster, because it has no employees yet.`,
      effect: { type: "add-department", name: newDepartment },
      effectNote: `Added the ${newDepartment} department.`,
    };
  }

  // Create work
  if (/\b(create|add|start|open)\b.*\b(work|task)\b/.test(text)) {
    const department = matchDepartment(ctx, text) ?? ctx.departments[0];
    if (!department) {
      return {
        text: "There is no department to queue that work into yet. Add a department first.",
        effect: { type: "none" },
        effectNote: "Nothing changed.",
      };
    }
    const title = parseWorkTitle(input) ?? "New work item from the founder";
    return {
      text: `Queued "${title}" in ${department.name} and assigned it to ${byId(ctx.agents, ctx.agents.find((a) => a.departmentId === department.id)?.id ?? "")?.name ?? "the department"}.`,
      effect: { type: "create-work", departmentId: department.id, title },
      effectNote: `Created work in ${department.name}.`,
    };
  }

  // Blocked, waiting, attention, credits, priorities
  if (/\bblocked\b|\bblocker\b|\bstuck\b/.test(text)) return summarizeBlocked(ctx);
  if (/\bwaiting\b|\bwaits?\b/.test(text)) return summarizeWaiting(ctx);
  if (/needs? me|attention|approval|approve|waiting on me|decide|decision needed/.test(text)) {
    return summarizeAttention(ctx);
  }
  if (/credit|spend|spent|budget|money|cost/.test(text)) return summarizeCredits(ctx);
  if (/priorit|goal|focus|roadmap/.test(text)) return summarizePriorities(ctx);

  // Who or which department
  const agent = matchAgent(ctx, text);
  if (agent && /what|how|doing|working|status|show/.test(text)) return summarizeAgent(ctx, agent);
  const department = matchDepartment(ctx, text);
  if (department) return summarizeDepartment(ctx, department);

  if (/how is the company|overview|status|what.s happening|summar/.test(text)) return summarizeCompany(ctx);

  return {
    text:
      "This is a prototype, so I answer from the simulated board: what needs you, what is blocked, what is waiting, which department is doing what, the credit position, and the priorities. I can also add a department, hire an AI employee or create work. Try asking what Engineering is working on.",
    effect: { type: "none" },
    effectNote: "Nothing changed.",
  };
}

/** The suggested asks shown under the conversation. */
export const SUGGESTED_ASKS: string[] = [
  "What needs my attention?",
  "What is Engineering working on?",
  "Show me blocked work",
  "How are we doing on credits?",
  "Add a legal department",
  "Hire an AI employee into Sales",
];
