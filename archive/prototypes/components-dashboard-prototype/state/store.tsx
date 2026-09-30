"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";

import { COMPANY, INITIAL_MESSAGES, MEMORY, PRIORITIES } from "../data/company";
import { ACTIVITY, ATTENTION, WORK } from "../data/operations";
import { AGENTS, DEPARTMENTS } from "../data/org";
import type { BoardContext, EaEffect, EaReply } from "../lib/simulate";
import type {
  ActivityEvent,
  Agent,
  AttentionItem,
  CompanyProfile,
  Department,
  EaMessage,
  Highlight,
  MemorySummary,
  PriorityItem,
  Selection,
  Status,
  WorkFilter,
  WorkItem,
} from "../types";

const EMPTY_HIGHLIGHT: Highlight = { departments: [], agents: [], work: [], attention: [], label: null };

export type PrototypeState = {
  company: CompanyProfile;
  departments: Department[];
  agents: Agent[];
  work: WorkItem[];
  attention: AttentionItem[];
  activity: ActivityEvent[];
  priorities: PriorityItem[];
  memory: MemorySummary;
  messages: EaMessage[];
  selection: Selection;
  highlight: Highlight;
  filter: WorkFilter;
  /** The Executive Agent is composing an answer. */
  thinking: boolean;
  /** Completed before the session started. The prototype does not fake completions. */
  completedToday: number;
  /** Everything a simulated action did, in order, for the reviewer to inspect. */
  simLog: string[];
  /** Mobile and tablet: the Executive Agent drawer. */
  eaOpen: boolean;
  /** Tool connections, simulated. */
  tools: string[];
};

export type PrototypeAction =
  | { type: "select"; selection: Selection }
  | { type: "clear-selection" }
  | { type: "ask"; text: string }
  | { type: "reply"; reply: EaReply }
  | { type: "resolve"; id: string; decision: "approved" | "rejected" }
  | { type: "hire"; departmentId: string; name: string; role: string }
  | { type: "add-department"; name: string }
  | { type: "create-work"; departmentId: string; title: string }
  | { type: "connect-tool"; name: string }
  | { type: "set-filter"; filter: WorkFilter }
  | { type: "toggle-ea"; open?: boolean };

const AT = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const uid = (prefix: string, suffix: string) => `${prefix}-${suffix}`;

/** Selecting something on the board and asking about it share one visual language. */
function highlightFor(
  state: { departments: Department[]; agents: Agent[]; work: WorkItem[]; attention: AttentionItem[] },
  selection: Selection,
): Highlight {
  if (!selection) return EMPTY_HIGHLIGHT;
  if (selection.kind === "department") {
    const agents = state.agents.filter((a) => a.departmentId === selection.id);
    return {
      departments: [selection.id],
      agents: agents.map((a) => a.id),
      work: state.work.filter((w) => w.departmentId === selection.id).map((w) => w.id),
      attention: [],
      label: `${state.departments.find((d) => d.id === selection.id)?.name ?? "Department"} highlighted`,
    };
  }
  if (selection.kind === "agent") {
    const agent = state.agents.find((a) => a.id === selection.id);
    if (!agent) return EMPTY_HIGHLIGHT;
    return {
      departments: [agent.departmentId],
      agents: [agent.id],
      work: state.work.filter((w) => w.agentId === agent.id).map((w) => w.id),
      attention: [],
      label: `${agent.name} highlighted`,
    };
  }
  if (selection.kind === "work") {
    const item = state.work.find((w) => w.id === selection.id);
    if (!item) return EMPTY_HIGHLIGHT;
    return {
      departments: [item.departmentId],
      agents: [item.agentId],
      work: [item.id],
      attention: [],
      label: `${item.title} highlighted`,
    };
  }
  const item = state.attention.find((a) => a.id === selection.id);
  if (!item) return EMPTY_HIGHLIGHT;
  return {
    departments: [item.departmentId],
    agents: [item.agentId],
    work: item.workId ? [item.workId] : [],
    attention: [item.id],
    label: `${item.title} highlighted`,
  };
}

export const initialState: PrototypeState = {
  company: COMPANY,
  departments: DEPARTMENTS,
  agents: AGENTS,
  work: WORK,
  attention: ATTENTION,
  activity: ACTIVITY,
  priorities: PRIORITIES,
  memory: MEMORY,
  messages: INITIAL_MESSAGES,
  selection: null,
  highlight: EMPTY_HIGHLIGHT,
  filter: "all",
  thinking: false,
  completedToday: 18,
  simLog: [],
  eaOpen: false,
  tools: ["GitHub", "Slack"],
};

export function prototypeReducer(state: PrototypeState, action: PrototypeAction): PrototypeState {
  switch (action.type) {
    case "select": {
      return { ...state, selection: action.selection, highlight: highlightFor(state, action.selection) };
    }

    case "clear-selection":
      return { ...state, selection: null, highlight: EMPTY_HIGHLIGHT, filter: "all" };

    case "ask":
      return {
        ...state,
        thinking: true,
        messages: [
          ...state.messages,
          { id: uid("msg", `${state.messages.length + 1}`), from: "founder", at: AT(), text: action.text, simulated: true },
        ],
      };

    case "reply": {
      const { reply } = action;
      let next: PrototypeState = {
        ...state,
        thinking: false,
        messages: [
          ...state.messages,
          {
            id: uid("msg", `${state.messages.length + 1}`),
            from: "ea",
            at: AT(),
            text: reply.text,
            effectNote: reply.effectNote,
            simulated: true,
          },
        ],
        simLog: [reply.effectNote, ...state.simLog].slice(0, 12),
      };
      next = applyEffect(next, reply.effect);
      return next;
    }

    case "resolve": {
      const item = state.attention.find((a) => a.id === action.id);
      if (!item) return state;
      const approved = action.decision === "approved";
      const workStatus: Status = approved ? "working" : "paused";
      const agentStatus: Status = approved ? "working" : "paused";
      const verb = approved ? "Approved" : "Rejected";
      const note = `${verb}: ${item.title}`;
      const owner = state.agents.find((a) => a.id === item.agentId)?.name ?? "The owner";

      return {
        ...state,
        // The panel acknowledges what the founder just did to the board, so the
        // conversation and the operating view never drift apart.
        messages: [
          ...state.messages,
          {
            id: uid("msg", `${state.messages.length + 1}`),
            from: "ea" as const,
            at: AT(),
            text: approved
              ? `Noted. "${item.title}" is unblocked and ${owner} is moving on it again. I have recorded the decision in company memory.`
              : `Understood. "${item.title}" is paused, and ${owner} will hold it until you reopen it.`,
            effectNote: approved ? "Reopened the work and closed the escalation." : "Paused the work and cleared the escalation.",
            simulated: true,
          },
        ],
        attention: state.attention.filter((a) => a.id !== action.id),
        work: state.work.map((w) =>
          w.id === item.workId
            ? { ...w, status: workStatus, blockedReason: approved ? undefined : w.blockedReason ?? item.reason }
            : w,
        ),
        agents: state.agents.map((a) =>
          a.id === item.agentId ? { ...a, status: agentStatus, focus: approved ? `${item.title} is unblocked and moving` : a.focus } : a,
        ),
        activity: [
          {
            id: uid("act", `sim-${state.activity.length + 1}`),
            at: "Just now",
            actor: "You",
            agentId: item.agentId,
            departmentId: item.departmentId,
            workId: item.workId,
            text: `${verb.toLowerCase()} the request: ${item.title}`,
            kind: "approval",
          },
          ...state.activity,
        ],
        memory: {
          ...state.memory,
          decisions: state.memory.decisions + 1,
          recent: [
            {
              id: uid("m", `sim-${state.memory.recent.length + 1}`),
              at: "Just now",
              kind: "decision" as const,
              text: `${note} (${state.departments.find((d) => d.id === item.departmentId)?.name ?? "the company"}), recorded from the attention queue.`,
            },
            ...state.memory.recent,
          ].slice(0, 5),
        },
        selection: null,
        highlight: EMPTY_HIGHLIGHT,
        simLog: [note, ...state.simLog].slice(0, 12),
      };
    }

    case "connect-tool": {
      if (state.tools.includes(action.name)) return state;
      return {
        ...state,
        tools: [...state.tools, action.name],
        activity: [
          {
            id: uid("act", `sim-tool-${state.tools.length + 1}`),
            at: "Just now",
            actor: "You",
            agentId: null,
            departmentId: null,
            workId: null,
            text: `Connected ${action.name} (simulated)`,
            kind: "structure",
          },
          ...state.activity,
        ],
        simLog: [`Connected ${action.name} (simulated, no authorisation ran).`, ...state.simLog].slice(0, 12),
      };
    }

    case "hire": {
      const agentId = uid("agent", action.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
      const agent: Agent = {
        id: agentId,
        name: action.name,
        role: action.role,
        departmentId: action.departmentId,
        status: "active",
        mode: "manual",
        authority: ["can"],
        focus: "Just hired, reading the department mandate",
        workId: null,
        hiredAt: "just now",
        simulated: true,
      };
      const department = state.departments.find((d) => d.id === action.departmentId);
      const selection: Selection = { kind: "agent", id: agentId };
      const withAgent = [...state.agents, agent];
      return {
        ...state,
        agents: withAgent,
        selection,
        highlight: highlightFor({ ...state, agents: withAgent }, selection),
        activity: [
          {
            id: uid("act", `sim-hire-${state.agents.length + 1}`),
            at: "Just now",
            actor: "Executive Agent",
            agentId,
            departmentId: action.departmentId,
            workId: null,
            text: `Hired ${action.name} into ${department?.name ?? "the company"} as ${action.role.toLowerCase()}`,
            kind: "hire",
          },
          ...state.activity,
        ],
        simLog: [`Hired ${action.name} (${action.role}) into ${department?.name ?? "unknown"}.`, ...state.simLog].slice(0, 12),
      };
    }

    case "add-department": {
      const departmentId = `custom-${action.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const department: Department = {
        id: departmentId,
        name: action.name,
        purpose: "New department. No mandate recorded yet.",
        icon: "custom",
        mandate: "Set by the founder when the first work is created.",
        createdAt: "just now",
        simulated: true,
      };
      const selection: Selection = { kind: "department", id: departmentId };
      const withDepartment = [...state.departments, department];
      return {
        ...state,
        departments: withDepartment,
        selection,
        highlight: highlightFor({ ...state, departments: withDepartment }, selection),
        activity: [
          {
            id: uid("act", `sim-dept-${state.departments.length + 1}`),
            at: "Just now",
            actor: "You",
            agentId: null,
            departmentId,
            workId: null,
            text: `Created the ${action.name} department`,
            kind: "structure",
          },
          ...state.activity,
        ],
        simLog: [`Created the ${action.name} department.`, ...state.simLog].slice(0, 12),
      };
    }

    case "create-work": {
      const departmentAgents = state.agents.filter((a) => a.departmentId === action.departmentId);
      const owner = departmentAgents[0];
      if (!owner) return state;
      const workId = uid("w", `sim-${state.work.length + 1}`);
      const item: WorkItem = {
        id: workId,
        title: action.title,
        departmentId: action.departmentId,
        agentId: owner.id,
        status: "working",
        progress: { done: 0, total: 3, unit: "steps" },
        origin: "Founder",
        startedAt: "just now",
        simulated: true,
      };
      const selection: Selection = { kind: "work", id: workId };
      const withWork = [...state.work, item];
      return {
        ...state,
        work: withWork,
        agents: state.agents.map((a) =>
          a.id === owner.id ? { ...a, workId, status: "working", focus: action.title } : a,
        ),
        selection,
        highlight: highlightFor({ ...state, work: withWork }, selection),
        activity: [
          {
            id: uid("act", `sim-work-${state.work.length + 1}`),
            at: "Just now",
            actor: "You",
            agentId: owner.id,
            departmentId: action.departmentId,
            workId,
            text: `Created "${action.title}" and assigned it to ${owner.name}`,
            kind: "work",
          },
          ...state.activity,
        ],
        simLog: [`Created work "${action.title}" in ${state.departments.find((d) => d.id === action.departmentId)?.name}.`, ...state.simLog].slice(0, 12),
      };
    }

    case "set-filter":
      return { ...state, filter: action.filter };

    case "toggle-ea":
      return { ...state, eaOpen: action.open ?? !state.eaOpen };

    default:
      return state;
  }
}

function applyEffect(state: PrototypeState, effect: EaEffect): PrototypeState {
  switch (effect.type) {
    case "highlight":
      return { ...state, highlight: effect.highlight, filter: effect.filter ?? state.filter };
    case "open":
      return { ...state, selection: effect.selection, highlight: highlightFor(state, effect.selection) };
    case "add-department":
      return prototypeReducer(state, { type: "add-department", name: effect.name });
    case "hire":
      return prototypeReducer(state, {
        type: "hire",
        departmentId: effect.departmentId,
        name: effect.name,
        role: effect.role,
      });
    case "create-work":
      return prototypeReducer(state, {
        type: "create-work",
        departmentId: effect.departmentId,
        title: effect.title,
      });
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ *
 * Counts, derived from the arrays so the board stays coherent.
 * ------------------------------------------------------------------ */

export type PrototypeCounts = {
  departments: number;
  agents: number;
  working: number;
  available: number;
  notWorking: number;
  activeWork: number;
  blocked: number;
  waiting: number;
  review: number;
  attention: number;
  attentionCredits: number;
  completedToday: number;
  credits: CompanyProfile["credits"];
  blockedWork: WorkItem[];
  waitingWork: WorkItem[];
};

export function deriveCounts(state: PrototypeState): PrototypeCounts {
  const working = state.agents.filter((a) => a.status === "working" || a.status === "active").length;
  return {
    departments: state.departments.length,
    agents: state.agents.length,
    working,
    available: state.agents.filter((a) => a.status === "active").length,
    notWorking: state.agents.length - working,
    activeWork: state.work.length,
    blocked: state.work.filter((w) => w.status === "blocked").length,
    waiting: state.work.filter((w) => w.status === "waiting").length,
    review: state.work.filter((w) => w.status === "review").length,
    attention: state.attention.length,
    attentionCredits: state.attention.reduce((sum, a) => sum + (a.costCredits ?? 0), 0),
    completedToday: state.completedToday,
    credits: state.company.credits,
    blockedWork: state.work.filter((w) => w.status === "blocked"),
    waitingWork: state.work.filter((w) => w.status === "waiting"),
  };
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

type PrototypeValue = {
  state: PrototypeState;
  dispatch: React.Dispatch<PrototypeAction>;
  counts: PrototypeCounts;
  /** The board as the simulation sees it. */
  board: BoardContext;
};

const PrototypeContext = createContext<PrototypeValue | null>(null);

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(prototypeReducer, initialState);
  const counts = useMemo(() => deriveCounts(state), [state]);
  const board = useMemo<BoardContext>(
    () => ({
      company: state.company,
      departments: state.departments,
      agents: state.agents,
      work: state.work,
      attention: state.attention,
      priorities: state.priorities,
      memory: state.memory,
    }),
    [state],
  );
  const value = useMemo(() => ({ state, dispatch, counts, board }), [state, counts, board]);
  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype(): PrototypeValue {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error("usePrototype must be used inside PrototypeProvider");
  return value;
}

/** Convenience: the board highlights a subset, or nothing at all. */
export function isHighlighted(ids: string[], id: string): boolean {
  return ids.length === 0 || ids.includes(id);
}

export function isDimmed(state: PrototypeState, ids: string[], id: string): boolean {
  return ids.length > 0 && !ids.includes(id);
}
