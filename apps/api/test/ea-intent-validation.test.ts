import { describe, expect, it } from 'vitest';
import { validateIntent, type IntentAnalysis } from '../src/services/executive-agent.js';

/**
 * Tool-param validation (rehearsal bug fix): the approval path once rendered
 * "I'll create agent (name: ., role: .)" because a hallucinated tool call with
 * punctuation-only params passed validation. These tests pin the guard.
 */

const baseIntent: IntentAnalysis = {
  intent: 'Hire an engineer',
  category: 'manage',
  requiresApproval: true,
  riskLevel: 'low',
  estimatedCost: 0,
  taskDecomposition: [],
  toolCalls: [],
  response: 'ok',
};

describe('validateIntent tool-call param guard', () => {
  it('accepts a well-formed tool call', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_agent', params: { name: 'Ada', role: 'engineer' } }],
      }),
    ).toBeNull();
  });

  it('rejects punctuation-only param values (the "name: ." bug)', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_agent', params: { name: '.', role: '.' } }],
      }),
    ).toMatch(/junk "name"/);
  });

  it('rejects whitespace-only param values', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_department', params: { name: '   ' } }],
      }),
    ).toMatch(/junk "name"/);
  });

  it('rejects a tool call with no tool name', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ params: {} } as unknown as { tool: string; params: Record<string, unknown> }],
      }),
    ).toMatch(/missing tool name/);
  });

  it('rejects non-object params', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_team', params: 'frontend' } as unknown as { tool: string; params: Record<string, unknown> }],
      }),
    ).toMatch(/params must be an object/);
  });

  it('rejects array params', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_team', params: ['a'] } as unknown as { tool: string; params: Record<string, unknown> }],
      }),
    ).toMatch(/params must be an object/);
  });

  it('allows empty-string params for legitimately optional fields? No — empty strings are junk too', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_goal', params: { title: '' } }],
      }),
    ).toMatch(/junk "title"/);
  });

  it('ignores null/undefined optional params but still validates present strings', () => {
    expect(
      validateIntent({
        ...baseIntent,
        toolCalls: [{ tool: 'create_agent', params: { name: 'Ada', departmentId: null } }],
      }),
    ).toBeNull();
  });

  it('still requires task decomposition when there are no tool calls', () => {
    expect(validateIntent({ ...baseIntent, toolCalls: undefined })).toMatch(/No tasks decomposed/);
  });
});
