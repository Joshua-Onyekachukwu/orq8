import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { auditEvents, type Db } from '@orq8/db';

// docs/34.4 — append-only, tamper-evident audit with a per-org hash chain:
//   hash = sha256(prev_hash || org_id || actor || action || payload || occurred_at)
//   prev_hash of the first row = genesis seed: sha256(org_id || genesis_salt)
const GENESIS_SALT = 'orq8-genesis-v1';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function genesisHash(orgId: string): string {
  return sha256(`${orgId}:${GENESIS_SALT}`);
}

export interface AuditInput {
  orgId: string;
  actorType: string; // user|agent|system
  actorId?: string | null;
  departmentId?: string | null;
  agentId?: string | null;
  taskId?: string | null;
  action: string;
  tool?: string | null;
  inputRef?: string | null;
  resultRef?: string | null;
  authorization?: string | null;
  approvalId?: string | null;
  policyRef?: string | null;
  cost?: number | null;
  outcome: string; // success|denied|failure
  occurredAt?: Date;
}

type PayloadFields = Omit<
  AuditInput,
  'orgId' | 'actorType' | 'actorId' | 'action' | 'occurredAt'
>;

// Deterministic payload serialization — identical key order on insert and verify.
function buildPayload(e: PayloadFields): string {
  return JSON.stringify({
    department_id: e.departmentId ?? null,
    agent_id: e.agentId ?? null,
    task_id: e.taskId ?? null,
    tool: e.tool ?? null,
    input_ref: e.inputRef ?? null,
    result_ref: e.resultRef ?? null,
    authorization: e.authorization ?? null,
    approval_id: e.approvalId ?? null,
    policy_ref: e.policyRef ?? null,
    cost: e.cost ?? null,
    outcome: e.outcome,
  });
}

export function computeAuditHash(input: {
  prevHash: string;
  orgId: string;
  actor: string;
  action: string;
  payload: string;
  occurredAt: Date;
}): string {
  return sha256(
    [
      input.prevHash,
      input.orgId,
      input.actor,
      input.action,
      input.payload,
      input.occurredAt.toISOString(),
    ].join('||'),
  );
}

export async function appendAudit(db: Db, input: AuditInput): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date();
  const [last] = await db
    .select({ id: auditEvents.id, hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, input.orgId))
    .orderBy(desc(auditEvents.id))
    .limit(1);
  const prevHash = last?.hash ?? genesisHash(input.orgId);
  const actor = `${input.actorType}:${input.actorId ?? ''}`;
  const payload = buildPayload(input);
  const hash = computeAuditHash({ prevHash, orgId: input.orgId, actor, action: input.action, payload, occurredAt });
  await db.insert(auditEvents).values({
    orgId: input.orgId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    departmentId: input.departmentId ?? null,
    agentId: input.agentId ?? null,
    taskId: input.taskId ?? null,
    action: input.action,
    tool: input.tool ?? null,
    inputRef: input.inputRef ?? null,
    resultRef: input.resultRef ?? null,
    authorization: input.authorization ?? null,
    approvalId: input.approvalId ?? null,
    policyRef: input.policyRef ?? null,
    cost: input.cost ?? null,
    outcome: input.outcome,
    occurredAt,
    prevHash,
    hash,
  });
}

export async function verifyChain(
  db: Db,
  orgId: string,
): Promise<{ valid: boolean; rows: number; firstBrokenId?: number }> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(auditEvents.id);
  let prevHash = genesisHash(orgId);
  for (const row of rows) {
    if (row.prevHash !== prevHash) {
      return { valid: false, rows: rows.length, firstBrokenId: row.id };
    }
    const actor = `${row.actorType}:${row.actorId ?? ''}`;
    const payload = buildPayload(row);
    const expectedHash = computeAuditHash({
      prevHash,
      orgId: row.orgId,
      actor,
      action: row.action,
      payload,
      occurredAt: row.occurredAt,
    });
    if (row.hash !== expectedHash) {
      return { valid: false, rows: rows.length, firstBrokenId: row.id };
    }
    prevHash = row.hash;
  }
  return { valid: true, rows: rows.length };
}
