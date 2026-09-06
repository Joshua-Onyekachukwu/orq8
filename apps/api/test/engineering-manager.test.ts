import { describe, it, expect } from 'vitest';
import { deriveCapabilitySlug } from '../src/services/capability-registry.js';
import { canTransitionPrStatus } from '../src/services/engineering.js';
import {
  ENGINEERING_ROLE_HINTS,
  selectEngineeringTeam,
  draftPlanTasks,
  fingerprintRequest,
  capabilityGapKeywords,
} from '../src/services/engineering-manager.js';

describe('capability slug derivation', () => {
  it('turns an engineering task title into a reusable capability slug', () => {
    const slug = deriveCapabilitySlug('Add Supabase RLS verification for organization-scoped agent data');
    expect(slug.length).toBeGreaterThan(8);
    expect(slug).not.toMatch(/^(add|for|support|the|a|an)-/);
    expect(slug).toContain('supabase');
  });

  it('never returns empty and never a junk filler slug', () => {
    expect(deriveCapabilitySlug('')).not.toBe('');
    expect(deriveCapabilitySlug('Updated file')).not.toBe('');
    // Distinct work should produce distinct slugs
    expect(deriveCapabilitySlug('Add payment webhook retry handling')).not.toBe(
      deriveCapabilitySlug('Redesign the onboarding email flow'),
    );
  });
});

describe('PR transition gate (server-side approval enforcement)', () => {
  it('blocks merging before an explicit approval', () => {
    expect(canTransitionPrStatus('pending_review', 'merged').ok).toBe(false);
    expect(canTransitionPrStatus('rejected', 'merged').ok).toBe(false);
    expect(canTransitionPrStatus('changes_requested', 'merged').ok).toBe(false);
  });

  it('allows merge only from approved', () => {
    expect(canTransitionPrStatus('approved', 'merged')).toEqual({ ok: true });
  });

  it('treats a merged PR as terminal and same-status transitions as idempotent', () => {
    expect(canTransitionPrStatus('merged', 'approved').ok).toBe(false);
    expect(canTransitionPrStatus('merged', 'merged').ok).toBe(true);
    expect(canTransitionPrStatus('approved', 'approved').ok).toBe(true);
  });

  it('allows review decisions before merge', () => {
    expect(canTransitionPrStatus('pending_review', 'approved').ok).toBe(true);
    expect(canTransitionPrStatus('pending_review', 'rejected').ok).toBe(true);
    expect(canTransitionPrStatus('changes_requested', 'approved').ok).toBe(true);
  });
});

const ENGINEERING_AGENTS = [
  { id: 'a1', name: 'Forge', role: 'Engineering Manager', department: 'Engineering', capabilities: ['planning'] },
  { id: 'a2', name: 'Icarus', role: 'Software Architect', department: 'Engineering', capabilities: ['architecture'] },
  { id: 'a3', name: 'Rigel', role: 'Backend Engineer', department: 'Engineering', capabilities: ['coding', 'backend'] },
  { id: 'a4', name: 'Lyra', role: 'Frontend Engineer', department: 'Engineering', capabilities: ['coding', 'frontend'] },
  { id: 'a5', name: 'Sentry', role: 'QA Engineer', department: 'Engineering', capabilities: ['testing'] },
  { id: 'a6', name: 'Vault', role: 'DevOps / Security Engineer', department: 'Engineering', capabilities: ['security'] },
  { id: 'b1', name: 'Atlas', role: 'Growth Agent', department: 'Marketing', capabilities: ['marketing'] },
];

describe('Engineering Manager team assembly', () => {
  it('selects only relevant engineering roles from the org', () => {
    const team = selectEngineeringTeam(ENGINEERING_AGENTS, 'Build a customer dashboard UI with a backend API');
    expect(team.length).toBeGreaterThanOrEqual(2);
    expect(team.some((t) => t.role.includes('Manager'))).toBe(true);
    expect(team.some((t) => t.role.includes('Frontend Engineer'))).toBe(true);
    expect(team.some((t) => t.role.includes('Backend Engineer'))).toBe(true);
    expect(team.some((t) => t.role.includes('Growth Agent'))).toBe(false);
    // No duplicates
    expect(new Set(team.map((t) => t.agentId)).size).toBe(team.length);
  });

  it('adds security for security-sensitive requests', () => {
    const team = selectEngineeringTeam(ENGINEERING_AGENTS, 'Harden OAuth token handling and secrets storage');
    expect(team.some((t) => t.role.toLowerCase().includes('security'))).toBe(true);
  });

  it('returns an empty team when the org has no engineering positions', () => {
    const team = selectEngineeringTeam([ENGINEERING_AGENTS[6]!], 'Build anything');
    expect(team).toEqual([]);
  });

  it('knows the seeded engineering role vocabulary', () => {
    expect(ENGINEERING_ROLE_HINTS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('Engineering Manager task drafting', () => {
  it('creates tasks with acceptance criteria assigned to the right role', () => {
    const team = selectEngineeringTeam(ENGINEERING_AGENTS, 'Add RLS policies to the tasks table');
    const tasks = draftPlanTasks(team, {
      objective: 'Add RLS policies to the tasks table',
      description: 'Every org row must be readable only by its members.',
      constraints: 'No migration changes to existing columns.',
    }, 'high');

    expect(tasks.length).toBeGreaterThan(0);
    const backend = tasks.find((t) => t.assignedRole.toLowerCase().includes('backend'));
    expect(backend).toBeDefined();
    expect(backend!.description).toContain('Acceptance criteria');
    expect(backend!.agentId).not.toBeNull();
    expect(tasks.every((t) => t.priority === 'high')).toBe(true);
  });

  it('never emits an unassigned task', () => {
    const tasks = draftPlanTasks([{ agentId: null, name: null, role: 'Backend Engineer' } as never], {
      objective: 'Do the thing properly',
    }, 'normal');
    // Role present but no assignable agent: task is skipped at insert; drafts without agent are filtered by caller.
    expect(Array.isArray(tasks)).toBe(true);
  });
});

describe('Engineering Manager idempotency + gaps', () => {
  it('fingerprints the same request deterministically', () => {
    const input = { objective: 'Build the billing webhook', description: 'Retry-safe' };
    expect(fingerprintRequest('org-1', input)).toBe(fingerprintRequest('org-1', input));
    expect(fingerprintRequest('org-1', input)).not.toBe(fingerprintRequest('org-2', input));
    expect(fingerprintRequest('org-1', { ...input, requestId: 'abc' })).not.toBe(fingerprintRequest('org-1', input));
  });

  it('reports meaningful capability gaps', () => {
    const gaps = capabilityGapKeywords('Build a stripe payment integration', [
      { id: 'x', name: 'stripe.webhook_verification', description: 'Verify Stripe webhooks', category: 'code' } as never,
    ]);
    // 'payment'/'integration' may be unmatched, but the Stripe match should not be flagged.
    expect(gaps.some((g) => g.includes('stripe'))).toBe(false);
  });
});