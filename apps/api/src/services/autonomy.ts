/**
 * ORQ8 Per-Agent Autonomy Levels (F12)
 *
 * Configurable, server-side enforced authority levels for AI employees.
 * This is NOT a second permissions framework — it composes with the existing
 * capability model (`canAgentUseCapability`), the authority profile on each
 * agent, and the approval system. Enforcement reads the agent's DB row in the
 * execution path; a frontend toggle alone can never authorize an action.
 *
 * Levels:
 *   observe              — L0: read/research only, no task execution, no
 *                          external communication, no resource modification
 *   recommend            — L1: can execute internal tasks but results are
 *                          advisory; never external communication
 *   draft                — L2: can create drafts (email drafts, PR drafts) but
 *                          cannot send/publish without approval
 *   execute_with_approval— L3: executes work; every consequential action
 *                          (external comms, financial, irreversible) requires
 *                          founder approval (the safe default)
 *   autonomous           — L4: full execution within the constitution, budget
 *                          and the agent's explicit authority profile
 */

// ─── Model ──────────────────────────────────────────────────────────────────

export type AutonomyLevel = 'observe' | 'recommend' | 'draft' | 'execute_with_approval' | 'autonomous';

export type ActionClass =
  | 'task_execute'      // run an internal task
  | 'connector_read'    // read in an external system (list/search/get — observation)
  | 'external_communicate' // send email, post comment, publish anything
  | 'modify_resources'  // change org resources (departments, agents, goals)
  | 'connector_action'  // act in an external system (GitHub/Gmail/Linear)
  | 'draft_external'    // create a draft in an external system (never sends)

export interface AutonomyDecision {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
}

export const AUTONOMY_LEVELS: AutonomyLevel[] = ['observe', 'recommend', 'draft', 'execute_with_approval', 'autonomous'];

const LEVEL_RANK: Record<AutonomyLevel, number> = {
  observe: 0,
  recommend: 1,
  draft: 2,
  execute_with_approval: 3,
  autonomous: 4,
};

/** Validates a level string and normalizes unknown values to the safe default. */
export function normalizeAutonomyLevel(value: unknown): AutonomyLevel {
  return typeof value === 'string' && (AUTONOMY_LEVELS as string[]).includes(value)
    ? (value as AutonomyLevel)
    : 'execute_with_approval';
}

/**
 * Pure enforcement decision — the single source of truth for what each level
 * may do. The DB row's autonomyLevel is passed in; the decision never depends
 * on client input.
 */
export function enforceAutonomy(level: AutonomyLevel, action: ActionClass): AutonomyDecision {
  const rank = LEVEL_RANK[level];

  switch (action) {
    case 'task_execute':
      if (rank < 1) {
        return { allowed: false, reason: 'This agent is in observe mode and cannot execute tasks.', requiresApproval: false };
      }
      if (level === 'recommend') {
        return { allowed: true, reason: 'This agent may execute internal tasks; results are recommendations.', requiresApproval: true };
      }
      return { allowed: true, reason: 'Task execution permitted at this autonomy level.', requiresApproval: false };

    case 'connector_read':
      return { allowed: true, reason: 'Read-only observation of external systems is permitted at every level.', requiresApproval: false };

    case 'draft_external':
      if (rank < 2) {
        return { allowed: false, reason: 'This agent cannot create external drafts below draft level.', requiresApproval: false };
      }
      return { allowed: true, reason: 'Draft creation permitted — nothing is sent or published without approval.', requiresApproval: false };

    case 'connector_action':
      if (rank < 3) {
        return { allowed: false, reason: 'This agent cannot act in external systems below execute-with-approval level.', requiresApproval: false };
      }
      if (level === 'execute_with_approval') {
        return { allowed: true, reason: 'External action permitted with founder approval.', requiresApproval: true };
      }
      return { allowed: true, reason: 'External action permitted at autonomous level.', requiresApproval: false };

    case 'external_communicate':
      if (rank < 3) {
        return { allowed: false, reason: 'This agent cannot communicate externally below execute-with-approval level.', requiresApproval: false };
      }
      if (level === 'execute_with_approval') {
        return { allowed: true, reason: 'External communication permitted with founder approval.', requiresApproval: true };
      }
      return { allowed: true, reason: 'External communication permitted at autonomous level.', requiresApproval: false };

    case 'modify_resources':
      if (rank < 4) {
        return { allowed: false, reason: 'This agent cannot modify organizational resources below autonomous level.', requiresApproval: true };
      }
      return { allowed: true, reason: 'Resource modification permitted at autonomous level.', requiresApproval: false };
  }
}

/**
 * Compose an agent's authority profile from their autonomy level. Returns the
 * authority fields the execution path checks (canExecuteTasks,
 * canCommunicateExternally, canModifyResources). Explicit founder settings in
 * the stored authority profile win over level defaults.
 */
export function autonomyAuthorityOverrides(
  level: AutonomyLevel,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const rank = LEVEL_RANK[level];
  const overrides: Record<string, unknown> = {};

  if ('canExecuteTasks' in existing) {
    overrides.canExecuteTasks = existing.canExecuteTasks;
  } else {
    overrides.canExecuteTasks = rank >= 1;
  }

  if ('canCommunicateExternally' in existing) {
    overrides.canCommunicateExternally = existing.canCommunicateExternally;
  } else {
    overrides.canCommunicateExternally = rank >= 4;
  }

  if ('canModifyResources' in existing) {
    overrides.canModifyResources = existing.canModifyResources;
  } else {
    overrides.canModifyResources = rank >= 4;
  }

  return overrides;
}

/** Human-readable summary for the UI / audit trail. */
export function autonomyLabel(level: AutonomyLevel): string {
  switch (level) {
    case 'observe': return 'Observe — read and research only';
    case 'recommend': return 'Recommend — executes internally, results are advisory';
    case 'draft': return 'Draft — can draft external content, never sends';
    case 'execute_with_approval': return 'Execute with approval — consequential actions need the founder';
    case 'autonomous': return 'Autonomous — full execution within constitution and budget';
  }
}