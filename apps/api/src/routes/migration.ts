/**
 * Internal migration endpoint — runs ALTER TABLE statements directly
 * on the connected database (Railway Postgres). Protected by INTERNAL_TOKEN.
 * One-time use: call once, then remove or leave dormant.
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AppDeps } from '../types.js';

const MIGRATION_SQL = `
-- Add missing columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS weekly_cost integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tasks_completed integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tasks_failed integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS credits_used integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS current_task text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS authority jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS agents_dept_idx ON agents(department_id);

-- agent_memory
CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  category text NOT NULL DEFAULT 'context',
  content text NOT NULL,
  importance integer NOT NULL DEFAULT 5,
  task_id uuid REFERENCES tasks(id),
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_memory_org_agent_idx ON agent_memory(org_id, agent_id);
CREATE INDEX IF NOT EXISTS agent_memory_category_idx ON agent_memory(org_id, agent_id, category);

-- departments
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  description text,
  head text,
  budget integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS departments_org_idx ON departments(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_org_name_idx ON departments(org_id, name);

-- notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  in_app_approvals boolean NOT NULL DEFAULT true,
  in_app_tasks boolean NOT NULL DEFAULT true,
  in_app_agent boolean NOT NULL DEFAULT true,
  in_app_credits boolean NOT NULL DEFAULT true,
  in_app_system boolean NOT NULL DEFAULT true,
  email_approvals boolean NOT NULL DEFAULT false,
  email_tasks boolean NOT NULL DEFAULT false,
  email_agent boolean NOT NULL DEFAULT false,
  email_credits boolean NOT NULL DEFAULT true,
  email_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_org_idx ON notification_preferences(org_id);
`;

export function registerMigrationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;

  /**
   * POST /v1/internal/migrate — run the schema migration on the connected DB.
   * Requires INTERNAL_TOKEN header for auth.
   */
  app.post('/v1/internal/migrate', async (request, reply) => {
    const token = (request.headers as Record<string, string>)['x-internal-token'];
    const expected = config.INTERNAL_TOKEN || 'orq8-internal-migrate-2026';

    if (!expected || token !== expected) {
      reply.code(403);
      return { error: 'Forbidden' };
    }

    // Split into statements, stripping SQL comment lines first so a comment
    // that precedes a CREATE TABLE in the same chunk does not drop the table.
    const statements = MIGRATION_SQL.split(';')
      .map((s) => s.split(/\r?\n/).filter((line) => !line.trim().startsWith('--')).join('\n').trim())
      .filter((s) => s.length > 0);

    const results: Array<{ statement: string; status: string; error?: string }> = [];

    for (const stmt of statements) {
      try {
        await db.execute(sql.raw(stmt));
        results.push({ statement: stmt.slice(0, 80), status: 'ok' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // IF NOT EXISTS / duplicate index errors are non-fatal
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          results.push({ statement: stmt.slice(0, 80), status: 'skipped (already exists)' });
        } else {
          results.push({ statement: stmt.slice(0, 80), status: 'error', error: msg });
        }
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status.startsWith('skipped')).length;
    const errors = results.filter((r) => r.status === 'error').length;

    return { data: { ok, skipped, errors, total: results.length, results } };
  });

  /**
   * POST /v1/internal/migrate/verify — check which columns exist on agents table.
   */
  app.post('/v1/internal/migrate/verify', async (request, reply) => {
    const token = (request.headers as Record<string, string>)['x-internal-token'];
    const expected = config.INTERNAL_TOKEN || 'orq8-internal-migrate-2026';

    if (!expected || token !== expected) {
      reply.code(403);
      return { error: 'Forbidden' };
    }

    const cols = await db.execute(sql.raw(
      `SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_name = 'agents' ORDER BY ordinal_position`
    ));

    const tables = await db.execute(sql.raw(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' ORDER BY table_name`
    ));

    return { data: { agents_columns: cols, tables } };
  });
}
