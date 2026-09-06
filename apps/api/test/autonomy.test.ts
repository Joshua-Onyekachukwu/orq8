import { describe, it, expect } from 'vitest';
import {
  enforceAutonomy,
  normalizeAutonomyLevel,
  autonomyAuthorityOverrides,
  autonomyLabel,
  AUTONOMY_LEVELS,
} from '../src/services/autonomy.js';

describe('autonomy level normalization', () => {
  it('accepts the five defined levels', () => {
    expect(AUTONOMY_LEVELS).toEqual(['observe', 'recommend', 'draft', 'execute_with_approval', 'autonomous']);
  });

  it('falls back to the safe default for unknown values', () => {
    expect(normalizeAutonomyLevel('god-mode')).toBe('execute_with_approval');
    expect(normalizeAutonomyLevel(undefined)).toBe('execute_with_approval');
    expect(normalizeAutonomyLevel(null)).toBe('execute_with_approval');
    expect(normalizeAutonomyLevel('observe')).toBe('observe');
  });
});

describe('autonomy enforcement matrix', () => {
  it('observe can read external systems but nothing else', () => {
    expect(enforceAutonomy('observe', 'connector_read').allowed).toBe(true);
    expect(enforceAutonomy('observe', 'task_execute').allowed).toBe(false);
    expect(enforceAutonomy('observe', 'connector_action').allowed).toBe(false);
    expect(enforceAutonomy('observe', 'external_communicate').allowed).toBe(false);
    expect(enforceAutonomy('observe', 'draft_external').allowed).toBe(false);
  });

  it('recommend may execute internally but results are advisory (approval-gated)', () => {
    const exec = enforceAutonomy('recommend', 'task_execute');
    expect(exec.allowed).toBe(true);
    expect(exec.requiresApproval).toBe(true);
    expect(enforceAutonomy('recommend', 'connector_read').allowed).toBe(true);
    expect(enforceAutonomy('recommend', 'connector_action').allowed).toBe(false);
    expect(enforceAutonomy('recommend', 'external_communicate').allowed).toBe(false);
  });

  it('draft can create external drafts but never send', () => {
    const draft = enforceAutonomy('draft', 'draft_external');
    expect(draft.allowed).toBe(true);
    expect(draft.requiresApproval).toBe(false);
    expect(enforceAutonomy('draft', 'connector_action').allowed).toBe(false);
    expect(enforceAutonomy('draft', 'external_communicate').allowed).toBe(false);
  });

  it('execute_with_approval can act externally only with approval', () => {
    const action = enforceAutonomy('execute_with_approval', 'connector_action');
    expect(action.allowed).toBe(true);
    expect(action.requiresApproval).toBe(true);
    const send = enforceAutonomy('execute_with_approval', 'external_communicate');
    expect(send.allowed).toBe(true);
    expect(send.requiresApproval).toBe(true);
    // But it cannot silently modify org resources
    expect(enforceAutonomy('execute_with_approval', 'modify_resources').allowed).toBe(false);
  });

  it('autonomous executes without approval but still cannot bypass capabilities', () => {
    expect(enforceAutonomy('autonomous', 'connector_action').requiresApproval).toBe(false);
    expect(enforceAutonomy('autonomous', 'external_communicate').requiresApproval).toBe(false);
    expect(enforceAutonomy('autonomous', 'modify_resources').allowed).toBe(true);
  });
});

describe('authority composition', () => {
  it('explicit founder settings win over level defaults', () => {
    const merged = autonomyAuthorityOverrides('observe', { canExecuteTasks: true });
    expect(merged.canExecuteTasks).toBe(true);
    expect(merged.canCommunicateExternally).toBe(false);
  });

  it('defaults follow the level', () => {
    const observe = autonomyAuthorityOverrides('observe', {});
    expect(observe.canExecuteTasks).toBe(false);
    const autonomous = autonomyAuthorityOverrides('autonomous', {});
    expect(autonomous.canExecuteTasks).toBe(true);
    expect(autonomous.canCommunicateExternally).toBe(true);
    expect(autonomous.canModifyResources).toBe(true);
  });
});

describe('labels', () => {
  it('describes every level', () => {
    for (const level of AUTONOMY_LEVELS) {
      expect(autonomyLabel(level).length).toBeGreaterThan(5);
    }
  });
});