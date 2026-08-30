import { describe, expect, it } from 'vitest';

/**
 * Command Execution tests — intent analysis (rule-based fallback),
 * task decomposition, agent selection, operation costs, and credit flow.
 *
 * Tests the pure business logic of the Executive Agent pipeline
 * without requiring a running server, database, or LLM.
 */

// ─── Intent Analysis (Fallback Rules) ────────────────────────────────────────

interface IntentResult {
  category: string;
  requiresApproval: boolean;
  riskLevel: string;
  suggestedAgentRole: string;
}

/**
 * Replicates the fallback analysis from executive-agent.ts.
 * Used when the LLM is unavailable.
 */
function fallbackAnalyze(command: string): IntentResult {
  const lower = command.toLowerCase();

  let category = 'plan';
  if (lower.includes('research') || lower.includes('analyze') || lower.includes('investigate')) category = 'research';
  else if (lower.includes('write') || lower.includes('draft') || lower.includes('create content')) category = 'write';
  else if (lower.includes('send') || lower.includes('email') || lower.includes('notify') || lower.includes('publish')) category = 'communicate';
  else if (lower.includes('report') || lower.includes('summary')) category = 'report';
  else if (lower.includes('deploy') || lower.includes('release') || lower.includes('execute')) category = 'execute';
  else if (lower.includes('manage') || lower.includes('organize') || lower.includes('hire')) category = 'manage';

  const needsApproval = ['send', 'publish', 'deploy', 'buy', 'purchase', 'delete', 'remove', 'hire', 'fire', 'email'].some(w => lower.includes(w));

  const agentRoleMap: Record<string, string> = {
    research: 'market_researcher',
    write: 'content_writer',
    communicate: 'communications_agent',
    execute: 'software_engineer',
    report: 'data_analyst',
    manage: 'operations_manager',
    plan: 'executive_agent',
    analyze: 'data_analyst',
  };

  return {
    category,
    requiresApproval: needsApproval,
    riskLevel: needsApproval ? 'medium' : 'low',
    suggestedAgentRole: agentRoleMap[category] ?? 'executive_agent',
  };
}

describe('Intent analysis — category detection', () => {
  it('detects research commands', () => {
    const result = fallbackAnalyze('Research the competitor landscape');
    expect(result.category).toBe('research');
    expect(result.suggestedAgentRole).toBe('market_researcher');
  });

  it('detects write commands', () => {
    const result = fallbackAnalyze('Write a blog post about our product');
    expect(result.category).toBe('write');
    expect(result.suggestedAgentRole).toBe('content_writer');
  });

  it('detects communicate commands', () => {
    const result = fallbackAnalyze('Send an email to the team');
    expect(result.category).toBe('communicate');
    expect(result.suggestedAgentRole).toBe('communications_agent');
  });

  it('detects report commands', () => {
    const result = fallbackAnalyze('Generate a weekly report');
    expect(result.category).toBe('report');
    expect(result.suggestedAgentRole).toBe('data_analyst');
  });

  it('detects execute commands', () => {
    const result = fallbackAnalyze('Deploy the new feature');
    expect(result.category).toBe('execute');
    expect(result.suggestedAgentRole).toBe('software_engineer');
  });

  it('detects manage commands', () => {
    const result = fallbackAnalyze('Hire a new marketing agent');
    expect(result.category).toBe('manage');
    expect(result.suggestedAgentRole).toBe('operations_manager');
  });

  it('defaults to plan for unrecognized commands', () => {
    const result = fallbackAnalyze('Do something amazing');
    expect(result.category).toBe('plan');
    expect(result.suggestedAgentRole).toBe('executive_agent');
  });
});

describe('Intent analysis — approval requirements', () => {
  it('requires approval for send commands', () => {
    expect(fallbackAnalyze('Send newsletter').requiresApproval).toBe(true);
  });

  it('requires approval for email commands', () => {
    expect(fallbackAnalyze('Email the investors').requiresApproval).toBe(true);
  });

  it('requires approval for deploy commands', () => {
    expect(fallbackAnalyze('Deploy to production').requiresApproval).toBe(true);
  });

  it('requires approval for delete commands', () => {
    expect(fallbackAnalyze('Delete the old database').requiresApproval).toBe(true);
  });

  it('requires approval for hire commands', () => {
    expect(fallbackAnalyze('Hire a new engineer').requiresApproval).toBe(true);
  });

  it('does NOT require approval for research', () => {
    expect(fallbackAnalyze('Research market trends').requiresApproval).toBe(false);
  });

  it('does NOT require approval for writing', () => {
    expect(fallbackAnalyze('Write a draft report').requiresApproval).toBe(false);
  });

  it('does NOT require approval for planning', () => {
    expect(fallbackAnalyze('Plan the next quarter').requiresApproval).toBe(false);
  });
});

describe('Intent analysis — risk levels', () => {
  it('sets medium risk for approval-required actions', () => {
    const result = fallbackAnalyze('Send email campaign');
    expect(result.riskLevel).toBe('medium');
    expect(result.requiresApproval).toBe(true);
  });

  it('sets low risk for safe actions', () => {
    const result = fallbackAnalyze('Research competitor pricing');
    expect(result.riskLevel).toBe('low');
    expect(result.requiresApproval).toBe(false);
  });
});

// ─── Task Decomposition ──────────────────────────────────────────────────────

interface TaskTemplate {
  title: string;
  description: string;
  suggestedAgentRole: string;
  priority: 'low' | 'normal' | 'high';
}

/**
 * Simulates task decomposition from a command.
 */
function decomposeCommand(command: string, category: string, requiresApproval: boolean): TaskTemplate[] {
  const priority = requiresApproval ? 'high' : 'normal';
  const truncated = command.length > 100 ? command.slice(0, 97) + '...' : command;

  return [{
    title: truncated,
    description: command,
    suggestedAgentRole: category === 'research' ? 'market_researcher'
      : category === 'write' ? 'content_writer'
      : category === 'communicate' ? 'communications_agent'
      : category === 'execute' ? 'software_engineer'
      : category === 'report' ? 'data_analyst'
      : category === 'manage' ? 'operations_manager'
      : 'executive_agent',
    priority,
  }];
}

describe('Task decomposition', () => {
  it('creates a task from a simple command', () => {
    const tasks = decomposeCommand('Research competitors', 'research', false);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Research competitors');
    expect(tasks[0].suggestedAgentRole).toBe('market_researcher');
    expect(tasks[0].priority).toBe('normal');
  });

  it('truncates long commands to 100 characters', () => {
    const longCommand = 'A'.repeat(150);
    const tasks = decomposeCommand(longCommand, 'plan', false);
    expect(tasks[0].title.length).toBeLessThanOrEqual(100);
    expect(tasks[0].title).toContain('...');
  });

  it('does not truncate short commands', () => {
    const tasks = decomposeCommand('Short command', 'plan', false);
    expect(tasks[0].title).toBe('Short command');
    expect(tasks[0].title).not.toContain('...');
  });

  it('sets high priority when approval is required', () => {
    const tasks = decomposeCommand('Deploy feature', 'execute', true);
    expect(tasks[0].priority).toBe('high');
  });

  it('sets normal priority when no approval needed', () => {
    const tasks = decomposeCommand('Draft memo', 'write', false);
    expect(tasks[0].priority).toBe('normal');
  });

  it('preserves the full command as description', () => {
    const command = 'Research the entire competitive landscape and create a detailed report';
    const tasks = decomposeCommand(command, 'research', false);
    expect(tasks[0].description).toBe(command);
  });
});

// ─── Agent Selection ─────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
}

/**
 * Simulates agent selection from the organization's agent pool.
 */
function selectAgent(agents: Agent[], requiredRole: string): Agent | null {
  const matching = agents.find(a => a.role === requiredRole && a.status === 'active');
  return matching ?? null;
}

describe('Agent selection', () => {
  const orgAgents: Agent[] = [
    { id: 'a1', name: 'Atlas', role: 'executive_agent', status: 'active' },
    { id: 'a2', name: 'Athena', role: 'market_researcher', status: 'active' },
    { id: 'a3', name: 'Forge', role: 'software_engineer', status: 'active' },
    { id: 'a4', name: 'Mercury', role: 'content_writer', status: 'paused' },
    { id: 'a5', name: 'Ledger', role: 'financial_analyst', status: 'active' },
  ];

  it('selects an active agent with the matching role', () => {
    const agent = selectAgent(orgAgents, 'market_researcher');
    expect(agent?.name).toBe('Athena');
  });

  it('returns null when no agent matches the role', () => {
    const agent = selectAgent(orgAgents, 'legal_advisor');
    expect(agent).toBeNull();
  });

  it('skips paused agents', () => {
    const agent = selectAgent(orgAgents, 'content_writer');
    expect(agent).toBeNull(); // Mercury is paused
  });

  it('selects the first matching active agent', () => {
    const agents: Agent[] = [
      { id: 'x1', name: 'Agent1', role: 'research', status: 'active' },
      { id: 'x2', name: 'Agent2', role: 'research', status: 'active' },
    ];
    const agent = selectAgent(agents, 'research');
    expect(agent?.id).toBe('x1');
  });

  it('handles empty agent list', () => {
    const agent = selectAgent([], 'market_researcher');
    expect(agent).toBeNull();
  });
});

// ─── Operation Costs ─────────────────────────────────────────────────────────

const OPERATION_COSTS: Record<string, number> = {
  'task.planned': 1,
  'task.created': 1,
  'task.executed': 2,
  'task.research': 2,
  'task.write': 2,
  'task.plan': 2,
  'task.analyze': 2,
  'task.communicate': 2,
  'task.execute': 2,
  'task.report': 2,
  'task.manage': 2,
  'research.deep': 5,
  'analysis.deep': 5,
  'code.generation': 5,
  'communication.external': 5,
  'default': 2,
};

const PLAN_CREDITS: Record<string, number> = {
  trial: 100,
  founder: 1_000,
  team: 4_000,
  company: 12_000,
  enterprise: 50_000,
};

describe('Operation costs', () => {
  it('returns correct cost for known operations', () => {
    expect(OPERATION_COSTS['task.research']).toBe(2);
    expect(OPERATION_COSTS['task.write']).toBe(2);
    expect(OPERATION_COSTS['research.deep']).toBe(5);
    expect(OPERATION_COSTS['code.generation']).toBe(5);
  });

  it('returns default cost for unknown operations', () => {
    expect(OPERATION_COSTS['unknown.operation'] ?? OPERATION_COSTS.default).toBe(2);
  });

  it('low-cost operations are cheaper than standard', () => {
    expect(OPERATION_COSTS['task.planned']).toBeLessThan(OPERATION_COSTS['task.executed']);
  });

  it('high-cost operations are more expensive than standard', () => {
    expect(OPERATION_COSTS['research.deep']).toBeGreaterThan(OPERATION_COSTS['task.research']);
    expect(OPERATION_COSTS['code.generation']).toBeGreaterThan(OPERATION_COSTS['task.executed']);
  });
});

describe('Plan credit allocation', () => {
  it('trial gets 100 credits', () => {
    expect(PLAN_CREDITS.trial).toBe(100);
  });

  it('founder gets 1,000 credits', () => {
    expect(PLAN_CREDITS.founder).toBe(1_000);
  });

  it('team gets 4,000 credits', () => {
    expect(PLAN_CREDITS.team).toBe(4_000);
  });

  it('company gets 12,000 credits', () => {
    expect(PLAN_CREDITS.company).toBe(12_000);
  });

  it('enterprise gets 50,000 credits', () => {
    expect(PLAN_CREDITS.enterprise).toBe(50_000);
  });

  it('each tier has more credits than the previous', () => {
    expect(PLAN_CREDITS.founder).toBeGreaterThan(PLAN_CREDITS.trial);
    expect(PLAN_CREDITS.team).toBeGreaterThan(PLAN_CREDITS.founder);
    expect(PLAN_CREDITS.company).toBeGreaterThan(PLAN_CREDITS.team);
    expect(PLAN_CREDITS.enterprise).toBeGreaterThan(PLAN_CREDITS.company);
  });
});

// ─── Credit Exhaustion Flow ──────────────────────────────────────────────────

describe('Credit exhaustion detection', () => {
  function checkCredits(remaining: number, required: number): { allowed: boolean; reason?: string } {
    if (remaining < required) {
      return { allowed: false, reason: `Need ${required} credits but only ${remaining} remaining` };
    }
    return { allowed: true };
  }

  it('allows when sufficient credits', () => {
    expect(checkCredits(100, 5).allowed).toBe(true);
  });

  it('rejects when insufficient credits', () => {
    const result = checkCredits(3, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Need 5');
  });

  it('allows exact credits', () => {
    expect(checkCredits(5, 5).allowed).toBe(true);
  });

  it('rejects when zero credits remain', () => {
    expect(checkCredits(0, 1).allowed).toBe(false);
  });

  it('allows zero-cost operations with zero credits', () => {
    expect(checkCredits(0, 0).allowed).toBe(true);
  });
});

// ─── Command Validation ──────────────────────────────────────────────────────

describe('Command input validation', () => {
  function validateCommand(input: string): { valid: boolean; error?: string } {
    if (!input || input.trim().length < 3) {
      return { valid: false, error: 'Command must be at least 3 characters' };
    }
    if (input.length > 2000) {
      return { valid: false, error: 'Command must be 2000 characters or less' };
    }
    return { valid: true };
  }

  it('accepts a valid command', () => {
    expect(validateCommand('Research competitors').valid).toBe(true);
  });

  it('rejects empty command', () => {
    expect(validateCommand('').valid).toBe(false);
  });

  it('rejects command shorter than 3 characters', () => {
    expect(validateCommand('ab').valid).toBe(false);
  });

  it('accepts command at exactly 3 characters', () => {
    expect(validateCommand('Run').valid).toBe(true);
  });

  it('rejects command over 2000 characters', () => {
    expect(validateCommand('a'.repeat(2001)).valid).toBe(false);
  });

  it('accepts command at exactly 2000 characters', () => {
    expect(validateCommand('a'.repeat(2000)).valid).toBe(true);
  });

  it('trims whitespace before validation', () => {
    expect(validateCommand('  ab  ').valid).toBe(false); // trimmed is 2 chars
    expect(validateCommand('  abc  ').valid).toBe(true); // trimmed is 3 chars
  });
});
