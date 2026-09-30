import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { agents as agentsTable, createDb, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

/**
 * Gap D (docs/66 §66.14) — the acceptance test the brief asks for: the founder
 * teaches ORQ8 something, it is stored, and a later task retrieves it and works
 * from it.
 *
 * Before this, each third of that sentence was true in isolation and the sentence
 * as a whole was not. Memory could be written; retrieval existed; the executor
 * built a context. But the keyword fallback matched the ENTIRE task description
 * as one substring of the memory content, so with no embedding provider
 * configured — the default state of the product — a task phrased in words the
 * founder did not happen to type verbatim found nothing. Nothing recorded that a
 * memory had ever been handed to an employee either, so "does the company
 * actually use what I taught it?" had no answer, in the product or in the data.
 *
 * What is asserted here, through HTTP against a real database:
 *
 *   teach     the founder stores a fact; it comes back on read and in search
 *   retrieve  a task written in different words surfaces that fact, ranked above
 *             knowledge that only shares a word (relevance, not importance)
 *   use       the fact reaches the model's prompt and shapes the task result
 *   prove     the memory row records that it was used, when, and how often
 *   isolate   one company's memory never reaches another company's work
 *
 * Only the LLM boundary is stubbed, and it is stubbed to echo the company
 * knowledge it was given. That is the point: the result can only contain the
 * taught fact if the fact genuinely travelled storage → retrieval → prompt →
 * task output. A stub that answered from thin air would prove nothing. No
 * embedding provider is configured in this environment, so the whole file
 * exercises the keyword path — the path a self-hosted company actually gets.
 */

const capture = vi.hoisted(() => ({
  prompts: [] as string[],
  taught: [] as string[],
}));

vi.mock('../src/services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/llm.js')>()),
  chat: async (_config: unknown, systemPrompt: string) => {
    capture.prompts.push(systemPrompt);
    const remembered = capture.taught.filter((fact) => systemPrompt.includes(fact));
    return remembered.length > 0
      ? `Done, working from company knowledge: ${remembered.join(' | ')}`
      : 'Done, but I had no company knowledge to work from.';
  },
}));

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
try {
  const probe = new (await import('pg')).Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

let app: FastifyInstance;

interface Company {
  token: string;
  orgId: string;
  agentId: string;
}

async function registerCompany(label: string): Promise<Company> {
  const email = `memory-${label}-${Date.now()}@test.com`;
  const reg = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: `Memory ${label} Co` },
  });
  expect(reg.statusCode, reg.payload).toBe(201);
  const body = JSON.parse(reg.payload) as { data: { token: string; org: { id: string } } };

  // The email gate lives in requireAuth and is covered by auth.integration.
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email.toLowerCase()));

  // An employee the work can be given to. Seeded directly rather than hired:
  // a Trial org is capped at three AI employees, and that cap is not what this
  // file is testing. `autonomous` keeps the work out of the approval gate, which
  // Gap A already covers in approval-gated-work.integration.test.ts.
  const [agent] = await db
    .insert(agentsTable)
    .values({
      orgId: body.data.org.id,
      name: 'Knowledge Worker',
      role: 'analyst',
      status: 'active',
      autonomyLevel: 'autonomous',
      authority: {
        canCreateTasks: true,
        canExecuteTasks: true,
        canAccessCompanyInfo: true,
        canCommunicateExternally: false,
        canModifyResources: false,
        spendingLimitCents: 0,
        requiresApprovalFor: [],
        forbiddenActions: [],
      },
    })
    .returning();

  return { token: body.data.token, orgId: body.data.org.id, agentId: agent!.id as string };
}

const auth = (company: Company) => ({
  authorization: `Bearer ${company.token}`,
  'content-type': 'application/json',
});

run('what the founder teaches ORQ8, ORQ8 later uses', () => {
  let acme: Company;
  let rival: Company;

  beforeAll(async () => {
    const created = createDb(config.DATABASE_URL);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config, db, pool, logger: createLogger(config) });
    await app.ready();

    acme = await registerCompany('acme');
    rival = await registerCompany('rival');
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });

  async function teach(company: Company, content: string, importance = 5) {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/memory',
      headers: auth(company),
      payload: { category: 'fact', content, importance, source: 'founder' },
    });
    expect(res.statusCode, res.payload).toBe(201);
    capture.taught.push(content);
    return (JSON.parse(res.payload) as { data: { id: string } }).data.id;
  }

  async function search(company: Company, query: string) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/memory?q=${encodeURIComponent(query)}`,
      headers: auth(company),
    });
    expect(res.statusCode, res.payload).toBe(200);
    return (JSON.parse(res.payload) as { data: Array<{ id: string; content: string }> }).data;
  }

  async function runTask(company: Company, title: string, description: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: auth(company),
      payload: { title, description, agentId: company.agentId },
    });
    expect(created.statusCode, created.payload).toBe(201);
    const taskId = (JSON.parse(created.payload) as { data: { id: string } }).data.id;

    const exec = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: auth(company),
    });
    expect(exec.statusCode, exec.payload).toBe(200);
    // `data` is the execution result, `status` the pipeline's final word.
    return JSON.parse(exec.payload) as { data: { status: string; result: string }; status: string };
  }

  it('stores what the founder teaches it, and gives it back', async () => {
    const fact = 'Acme Corp renewal paperwork is due on the 14th — invoice ACME-14, owner Priya.';
    const id = await teach(acme, fact, 8);

    const read = await app.inject({ method: 'GET', url: `/v1/memory/${id}`, headers: auth(acme) });
    expect(read.statusCode, read.payload).toBe(200);
    const entry = JSON.parse(read.payload) as { data: { content: string; category: string; useCount: number } };
    expect(entry.data.content).toBe(fact);
    expect(entry.data.category).toBe('fact');
    // Taught, not yet used: retrieval evidence starts honest at zero.
    expect(entry.data.useCount).toBe(0);

    const stats = await app.inject({ method: 'GET', url: '/v1/memory/stats', headers: auth(acme) });
    expect(JSON.parse(stats.payload).data.totalEntries).toBeGreaterThanOrEqual(1);
  });

  it('finds the taught knowledge for a task phrased in different words', async () => {
    // Only two of these share a term with the query. The distractor is the more
    // important one, so importance-first ordering cannot pass this test: the
    // entry that actually answers the question has to rank first.
    const answer = await teach(
      acme,
      'Acme Corp renewal paperwork is due on the 14th — invoice ACME-14, owner Priya.',
      5,
    );
    const distractor = await teach(acme, 'Acme conference swag is stored in the back office.', 10);

    // Words the founder never wrote in the memory: the query only overlaps on
    // renewal / paperwork / Acme.
    const results = await search(acme, 'Prepare the renewal paperwork for Acme');

    const ids = results.map((r) => r.id);
    expect(ids, JSON.stringify(results)).toContain(answer);
    // The one-term, high-importance entry must not outrank the entry that
    // actually answers the question. (An earlier test taught a similar ACME fact
    // at higher importance; that one may legitimately rank alongside, which is
    // why this compares the two entries at issue rather than demanding first place.)
    expect(ids).toContain(distractor);
    expect(ids.indexOf(answer), JSON.stringify(results)).toBeLessThan(ids.indexOf(distractor));
  });

  it('retrieves the knowledge for a later task, and the task works from it', async () => {
    const fact = 'Northwind Logistics pays by wire, 30 days from invoice — never by card.';
    const memoryId = await teach(acme, fact, 9);

    const before = await app.inject({ method: 'GET', url: `/v1/memory/${memoryId}`, headers: auth(acme) });
    expect(JSON.parse(before.payload).data.useCount).toBe(0);
    expect(JSON.parse(before.payload).data.lastUsedAt).toBeNull();

    capture.prompts.length = 0;
    const exec = await runTask(
      acme,
      'Chase the Northwind invoice',
      'Send the Northwind Logistics payment reminder for the outstanding invoice.',
    );
    expect(exec.status, JSON.stringify(exec)).toBe('completed');
    expect(exec.data.status, JSON.stringify(exec)).toBe('completed');

    // 1. The knowledge reached the model. This is the retrieval half.
    const prompt = capture.prompts.at(-1) ?? '';
    expect(prompt).toContain('## Company Memory');
    expect(prompt).toContain(fact);

    // 2. The knowledge shaped the work. The stub can only echo a fact it was
    //    actually given, so this result is the end-to-end proof.
    expect(exec.data.result).toContain(fact);

    // 3. The use was recorded, so it can be answered later and by someone else.
    const after = await app.inject({ method: 'GET', url: `/v1/memory/${memoryId}`, headers: auth(acme) });
    const used = JSON.parse(after.payload).data as { useCount: number; lastUsedAt: string | null };
    expect(used.useCount).toBeGreaterThanOrEqual(1);
    expect(used.lastUsedAt).not.toBeNull();
  });

  it('never lets one company\'s knowledge reach another company\'s work', async () => {
    const secret = 'Rival Holdings acquires companies through the Orbital fund vehicle.';
    await teach(rival, secret, 10);

    // Not in the other company's search…
    const found = await search(acme, 'Orbital fund vehicle acquisitions');
    expect(found.map((r) => r.content)).not.toContain(secret);

    // …and not in the other company's work.
    capture.prompts.length = 0;
    await runTask(
      acme,
      'Review the Orbital fund vehicle',
      'Assess the Orbital fund vehicle acquisition structure used by Rival Holdings.',
    );
    const prompt = capture.prompts.at(-1) ?? '';
    expect(prompt).not.toContain(secret);
  });
});
