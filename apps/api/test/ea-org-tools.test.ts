import { describe, it, expect } from 'vitest';
import {
  findBestAgent,
  analyzeWorkforce,
  archiveDepartment,
  archiveTeam,
} from '../src/services/ea-tools.js';
import type { ToolContext } from '../src/services/ea-tools.js';

/**
 * These tests exercise the validation and error-fallback paths of the four
 * organizational EA tools without a live database. DB-backed behavior is
 * covered by the DB-gated integration suites.
 */
const ctx: ToolContext = {
  db: {} as ToolContext['db'],
  orgId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
};

describe('find_best_agent validation', () => {
  it('rejects a missing task description', async () => {
    const r = await findBestAgent(ctx, {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('missing_task');
    expect(r.tool).toBe('find_best_agent');
  });

  it('rejects a whitespace-only task description', async () => {
    const r = await findBestAgent(ctx, { task: '   ' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('missing_task');
  });

  it('rejects a non-string task description', async () => {
    const r = await findBestAgent(ctx, { task: 42 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('missing_task');
  });
});

describe('analyze_workforce error containment', () => {
  it('returns a structured failure when the workforce engine throws', async () => {
    // Empty db stub → workforce engine will throw on its first query; the
    // tool must convert that into a structured ToolResult, never a throw.
    const r = await analyzeWorkforce(ctx);
    expect(r.success).toBe(false);
    expect(r.tool).toBe('analyze_workforce');
    expect(r.error).toBe('analysis_failed');
    expect(typeof r.message).toBe('string');
  });
});

describe('archive_department validation', () => {
  it('rejects an invalid departmentId format', async () => {
    const r = await archiveDepartment(ctx, { departmentId: 'not-a-uuid' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_id');
  });

  it('rejects a missing departmentId', async () => {
    const r = await archiveDepartment(ctx, {});
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_id');
  });
});

describe('archive_team validation', () => {
  it('rejects an invalid teamId format', async () => {
    const r = await archiveTeam(ctx, { teamId: 'team-123' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_id');
  });

  it('rejects a missing teamId', async () => {
    const r = await archiveTeam(ctx, { restore: true });
    expect(r.success).toBe(false);
    expect(r.error).toBe('invalid_id');
  });
});
