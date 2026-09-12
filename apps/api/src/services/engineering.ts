import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import {
  repositories,
  repositoryBranches,
  repositoryFiles,
  repositoryFileContents,
  repoEvents,
  sandboxRuns,
  repositoryPrs,
  engineeringTasks,
  approvals as approvalsTable,
  type Db,
  type Repository,
  type NewRepository,
  type RepositoryBranch,
  type RepositoryFile,
  type RepoEvent,
  type NewRepoEvent,
  type SandboxRun,
  type NewSandboxRun,
  type RepositoryPr,
  type NewRepositoryPr,
  type EngineeringTask,
  type NewEngineeringTask,
} from '@orq8/db';
import { appendAudit } from './audit.js';
import { createMemory } from './memory.js';
import { createApproval, findById as findApprovalById } from './approvals.js';
import { createNotification } from '../routes/notifications.js';
import type { Approval } from '@orq8/db';

// ─── Repositories ────────────────────────────────────────────────────────────

export async function listRepositories(db: Db, orgId: string): Promise<Repository[]> {
  return db
    .select()
    .from(repositories)
    .where(eq(repositories.orgId, orgId))
    .orderBy(desc(repositories.updatedAt));
}

export async function getRepository(db: Db, orgId: string, id: string): Promise<Repository | undefined> {
  const rows = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.id, id), eq(repositories.orgId, orgId)))
    .limit(1);
  return rows[0];
}

export async function createRepository(db: Db, data: NewRepository): Promise<Repository> {
  const rows = await db.insert(repositories).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createRepository returned no row');
  await appendAudit(db, {
    orgId: data.orgId,
    actorType: 'user',
    action: 'repository.imported',
    outcome: 'success',
  });
  return row;
}

export async function deleteRepository(db: Db, orgId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(repositories)
    .where(and(eq(repositories.id, id), eq(repositories.orgId, orgId)))
    .returning({ id: repositories.id });
  return rows.length > 0;
}

// ─── Branches ────────────────────────────────────────────────────────────────

export async function listBranches(db: Db, repositoryId: string): Promise<RepositoryBranch[]> {
  return db
    .select()
    .from(repositoryBranches)
    .where(eq(repositoryBranches.repositoryId, repositoryId))
    .orderBy(desc(repositoryBranches.lastSyncAt));
}

export async function getBranch(db: Db, repositoryId: string, name: string): Promise<RepositoryBranch | undefined> {
  const rows = await db
    .select()
    .from(repositoryBranches)
    .where(and(eq(repositoryBranches.repositoryId, repositoryId), eq(repositoryBranches.name, name)))
    .limit(1);
  return rows[0];
}

export async function upsertBranch(db: Db, data: Omit<RepositoryBranch, 'id' | 'createdAt'>): Promise<RepositoryBranch> {
  const [existing] = await db
    .select()
    .from(repositoryBranches)
    .where(
      and(
        eq(repositoryBranches.repositoryId, data.repositoryId),
        eq(repositoryBranches.name, data.name),
      ),
    )
    .limit(1);

  if (existing) {
    const rows = await db
      .update(repositoryBranches)
      .set({ ...data, lastSyncAt: new Date() })
      .where(eq(repositoryBranches.id, existing.id))
      .returning();
    return rows[0] ?? existing;
  }

  const rows = await db.insert(repositoryBranches).values(data).returning();
  return rows[0]!;
}

// ─── Files ───────────────────────────────────────────────────────────────────

export async function listFiles(db: Db, repositoryId: string, branch: string, prefix?: string): Promise<RepositoryFile[]> {
  const conditions = [eq(repositoryFiles.repositoryId, repositoryId), eq(repositoryFiles.branch, branch)];
  if (prefix) conditions.push(eq(repositoryFiles.path, prefix));
  return db.select().from(repositoryFiles).where(and(...conditions)).orderBy(asc(repositoryFiles.path));
}

export async function getFile(db: Db, repositoryId: string, branch: string, path: string): Promise<RepositoryFile | undefined> {
  const rows = await db
    .select()
    .from(repositoryFiles)
    .where(
      and(
        eq(repositoryFiles.repositoryId, repositoryId),
        eq(repositoryFiles.branch, branch),
        eq(repositoryFiles.path, path),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function getFileContent(db: Db, fileId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(repositoryFileContents)
    .where(eq(repositoryFileContents.fileId, fileId))
    .limit(1);
  return rows[0]?.body ?? null;
}

export async function upsertFile(db: Db, data: Omit<RepositoryFile, 'id' | 'createdAt' | 'indexedAt'>): Promise<RepositoryFile> {
  const [existing] = await db
    .select()
    .from(repositoryFiles)
    .where(
      and(
        eq(repositoryFiles.repositoryId, data.repositoryId),
        eq(repositoryFiles.branch, data.branch),
        eq(repositoryFiles.path, data.path),
      ),
    )
    .limit(1);

  if (existing) {
    const rows = await db
      .update(repositoryFiles)
      .set(data)
      .where(eq(repositoryFiles.id, existing.id))
      .returning();
    return rows[0] ?? existing;
  }

  const rows = await db.insert(repositoryFiles).values(data).returning();
  return rows[0]!;
}

export async function upsertFileContent(db: Db, fileId: string, body: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(repositoryFileContents)
    .where(eq(repositoryFileContents.fileId, fileId))
    .limit(1);

  if (existing) {
    await db
      .update(repositoryFileContents)
      .set({ body, storedAt: new Date() })
      .where(eq(repositoryFileContents.id, existing.id));
  } else {
    await db.insert(repositoryFileContents).values({ fileId, body });
  }
}

// ─── Repo Events ─────────────────────────────────────────────────────────────

export async function logRepoEvent(
  db: Db,
  data: NewRepoEvent,
): Promise<RepoEvent> {
  const rows = await db.insert(repoEvents).values(data).returning();
  return rows[0]!;
}

// ─── Sandbox Runs ────────────────────────────────────────────────────────────

export async function listSandboxRuns(db: Db, orgId: string, limit = 50): Promise<SandboxRun[]> {
  return db
    .select()
    .from(sandboxRuns)
    .where(eq(sandboxRuns.orgId, orgId))
    .orderBy(desc(sandboxRuns.createdAt))
    .limit(limit);
}

export async function createSandboxRun(db: Db, data: NewSandboxRun): Promise<SandboxRun> {
  const rows = await db.insert(sandboxRuns).values(data).returning();
  return rows[0]!;
}

export async function getSandboxRun(db: Db, orgId: string, id: string): Promise<SandboxRun | undefined> {
  const rows = await db
    .select()
    .from(sandboxRuns)
    .where(and(eq(sandboxRuns.id, id), eq(sandboxRuns.orgId, orgId)))
    .limit(1);
  return rows[0];
}

export async function updateSandboxRun(
  db: Db,
  id: string,
  updates: Partial<Pick<SandboxRun, 'state' | 'stdout' | 'stderr' | 'exitCode' | 'resultSummary' | 'startedAt' | 'finishedAt' | 'usedCredits' | 'allocatedCredits' | 'workingDir'>>,
): Promise<SandboxRun | undefined> {
  const rows = await db
    .update(sandboxRuns)
    .set(updates as Partial<SandboxRun>)
    .where(eq(sandboxRuns.id, id))
    .returning();
  return rows[0];
}

// ─── PRs ─────────────────────────────────────────────────────────────────────

export async function listPrs(db: Db, repositoryId: string): Promise<RepositoryPr[]> {
  return db
    .select()
    .from(repositoryPrs)
    .where(eq(repositoryPrs.repositoryId, repositoryId))
    .orderBy(desc(repositoryPrs.createdAt));
}

export async function getPr(db: Db, orgId: string, id: string): Promise<RepositoryPr | undefined> {
  // Org-scoped lookup: resolve the PR's repository, then verify the repository
  // belongs to the requesting org. Prevents cross-org PR access via IDOR.
  const [pr] = await db
    .select()
    .from(repositoryPrs)
    .where(eq(repositoryPrs.id, id))
    .limit(1);
  if (!pr) return undefined;

  const [repo] = await db
    .select({ id: repositories.id, orgId: repositories.orgId })
    .from(repositories)
    .where(eq(repositories.id, pr.repositoryId))
    .limit(1);

  if (!repo || repo.orgId !== orgId) return undefined;
  return pr;
}

export async function createPr(db: Db, orgId: string, data: NewRepositoryPr): Promise<RepositoryPr> {
  const rows = await db.insert(repositoryPrs).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createPr returned no row');
  await appendAudit(db, {
    orgId,
    actorType: 'agent',
    actorId: data.authorId,
    action: 'pr.created',
    outcome: 'success',
  });
  return row;
}

/**
 * PR status state machine — merging is server-side approval-gated. A PR can
 * only be merged after it has been explicitly approved by a reviewer; a merged
 * PR is terminal. Idempotent (same status → ok).
 */
export function canTransitionPrStatus(current: string, next: string): { ok: boolean; reason?: string } {
  if (current === next) return { ok: true };
  if (next === 'merged') {
    return current === 'approved'
      ? { ok: true }
      : { ok: false, reason: 'PR must be approved before it can be merged' };
  }
  if (current === 'merged') {
    return { ok: false, reason: 'A merged PR cannot be reopened or changed' };
  }
  return { ok: true };
}

export interface OrgPrDetails extends RepositoryPr {
  repositoryName: string | null;
  task: {
    id: string;
    title: string;
    acceptanceCriteria: string | null;
    testsSummary: unknown | null;
    diffSummary: unknown | null;
  } | null;
}

/** List PRs org-wide (join repository + linked engineering task) — for review surfaces. */
export async function listOrgPrs(db: Db, orgId: string): Promise<OrgPrDetails[]> {
  const rows = await db
    .select({
      pr: repositoryPrs,
      repositoryName: repositories.name,
    })
    .from(repositoryPrs)
    .innerJoin(repositories, eq(repositoryPrs.repositoryId, repositories.id))
    .where(eq(repositories.orgId, orgId))
    .orderBy(desc(repositoryPrs.createdAt))
    .limit(200);

  const prIds = rows.map((r) => r.pr.id);
  let tasksByPr = new Map<string, EngineeringTask>();
  if (prIds.length > 0) {
    const linked = await db
      .select()
      .from(engineeringTasks)
      .where(inArray(engineeringTasks.prId, prIds));
    tasksByPr = new Map(linked.map((t) => [t.prId!, t]));
  }

  return rows.map(({ pr, repositoryName }) => {
    const task = tasksByPr.get(pr.id);
    return {
      ...pr,
      repositoryName,
      task: task
        ? {
            id: task.id,
            title: task.title,
            acceptanceCriteria: task.acceptanceCriteria,
            testsSummary: task.testsSummary,
            diffSummary: task.diffSummary,
          }
        : null,
    };
  });
}

export async function updatePrStatus(
  db: Db,
  id: string,
  status: string,
  approvalId?: string,
  approvedBy?: string,
): Promise<RepositoryPr | undefined> {
  const updates: Partial<RepositoryPr> = { status };
  if (approvalId) updates.approvalId = approvalId;
  if (approvedBy) updates.approvedBy = approvedBy;
  if (status === 'merged') updates.mergedAt = new Date();
  const rows = await db.update(repositoryPrs).set(updates).where(eq(repositoryPrs.id, id)).returning();
  return rows[0];
}

// ─── PR merge approvals (central approvals table) ───────────────────────────

/**
 * Request founder approval to merge a PR. Creates a real record in the central
 * `approvals` table (surface in Command Center) and links it to the PR via the
 * existing repository_prs.approval_id column. Idempotent: re-requesting returns
 * the existing pending/resolved approval for the same PR instead of creating a
 * duplicate. The merge itself stays server-side gated on this record.
 */
export async function requestPrMergeApproval(
  db: Db,
  orgId: string,
  userId: string,
  prId: string,
): Promise<{ pr: RepositoryPr; approval: Approval; created: boolean } | { error: { code: string; message: string; status: number } }> {
  const pr = await getPr(db, orgId, prId);
  if (!pr) return { error: { code: 'not_found', message: 'PR not found', status: 404 } };
  if (pr.status === 'merged') return { error: { code: 'already_merged', message: 'This PR is already merged', status: 409 } };

  // Idempotency: the PR already carries a linked approval (or an earlier
  // request left a pending approval mentioning this PR). A REJECTED approval
  // must not dead-end the workflow: the founder's rejection is final for that
  // request, but the team may address the feedback and re-request — so a new
  // approval is created and linked, and the stale one is superseded.
  if (pr.approvalId) {
    const existing = await findApprovalById(db, orgId, pr.approvalId);
    if (existing && existing.status === 'rejected') {
      // fall through to fresh-creation below
    } else if (existing) {
      return { pr, approval: existing, created: false };
    }
  }
  const pendingForPr = await findMergeApprovalForPr(db, orgId, prId);
  if (pendingForPr) {
    await updatePrStatus(db, prId, pr.status, pendingForPr.id);
    return { pr: { ...pr, approvalId: pendingForPr.id }, approval: pendingForPr, created: false };
  }

  // Linked engineering task supplies the requesting agent + review evidence.
  const [linkedTask] = await db
    .select()
    .from(engineeringTasks)
    .where(eq(engineeringTasks.prId, pr.id))
    .limit(1);
  const tests = (linkedTask?.testsSummary as { passed?: number; failed?: number; total?: number } | null | undefined);
  const diff = (linkedTask?.diffSummary as { filesChanged?: number; additions?: number; deletions?: number; majorAreas?: string[] } | null | undefined);
  // Risk heuristic: failing tests or a large diff surface → high; else medium.
  const riskLevel = (tests && (tests.failed ?? 0) > 0) || (diff && (diff.filesChanged ?? 0) > 30) ? 'high' : 'medium';

  const description = [
    `prId:${pr.id}`,
    `PR "${pr.title}" (${pr.headBranch} → ${pr.baseBranch})${pr.providerPrNumber ? ` · #${pr.providerPrNumber}` : ''}.`,
    linkedTask ? `Engineering task: ${linkedTask.title}.` : undefined,
    tests && tests.total !== undefined ? `Tests: ${tests.passed ?? 0}/${tests.total} passed${tests.failed ? ` (${tests.failed} failed)` : ''}.` : undefined,
    diff && diff.filesChanged !== undefined ? `Diff: ${diff.filesChanged} files, +${diff.additions ?? 0}/-${diff.deletions ?? 0} lines.` : undefined,
    'Merge executes only after explicit founder approval in Command Center.',
  ].filter(Boolean).join('\n');

  const approval = await createApproval(db, {
    orgId,
    agentId: linkedTask?.assigneeId ?? null,
    action: `Merge PR: ${pr.title}`,
    description,
    cost: 0,
    riskLevel,
    status: 'pending',
  });
  await updatePrStatus(db, prId, pr.status, approval.id);

  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: pr.approvalId ? 'pr.approval_re_requested' : 'pr.approval_requested',
    outcome: 'success',
    resultRef: `${pr.id} → approval:${approval.id}`,
  });
  try {
    await createNotification(db, orgId, 'approval', 'Merge approval required', `PR "${pr.title}" needs your decision before merging.`);
  } catch {
    // Non-fatal — the approval record itself is the source of truth.
  }

  return { pr, approval, created: true };
}

/** Find a pending/resolved merge approval that references the given PR. */
async function findMergeApprovalForPr(db: Db, orgId: string, prId: string): Promise<Approval | undefined> {
  const rows = await db
    .select()
    .from(approvalsTable)
    .where(and(eq(approvalsTable.orgId, orgId), eq(approvalsTable.status, 'pending')))
    .limit(100);
  return rows.find((a) => a.action.startsWith('Merge PR:') && a.description?.includes(`prId:${prId}`));
}

/**
 * Merge gate: verify the PR carries an approved approval record. The founder
 * approves in Command Center (decide()), which also flips the PR to 'approved';
 * this check is the final server-side gate before 'merged'.
 */
export async function requireApprovedPrMerge(db: Db, orgId: string, prId: string): Promise<{ ok: true } | { ok: false; reason: string; status: number }> {
  const pr = await getPr(db, orgId, prId);
  if (!pr) return { ok: false, reason: 'PR not found', status: 404 };
  const approval = pr.approvalId ? await findApprovalById(db, orgId, pr.approvalId) : undefined;
  if (!approval) {
    return { ok: false, reason: 'No merge approval has been requested for this PR — request one first', status: 409 };
  }
  if (approval.status === 'pending') {
    return { ok: false, reason: 'The merge approval is awaiting your decision in Command Center', status: 409 };
  }
  if (approval.status !== 'approved') {
    return { ok: false, reason: `The merge approval was ${approval.status} — it cannot be merged`, status: 409 };
  }
  return { ok: true };
}

// ─── Engineering Tasks ───────────────────────────────────────────────────────

export async function listEngineeringTasks(db: Db, orgId: string): Promise<EngineeringTask[]> {
  return db
    .select()
    .from(engineeringTasks)
    .where(eq(engineeringTasks.orgId, orgId))
    .orderBy(desc(engineeringTasks.createdAt));
}

export async function getEngineeringTask(db: Db, orgId: string, id: string): Promise<EngineeringTask | undefined> {
  const rows = await db
    .select()
    .from(engineeringTasks)
    .where(and(eq(engineeringTasks.id, id), eq(engineeringTasks.orgId, orgId)))
    .limit(1);
  return rows[0];
}

export async function createEngineeringTask(db: Db, data: NewEngineeringTask): Promise<EngineeringTask> {
  const rows = await db.insert(engineeringTasks).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createEngineeringTask returned no row');
  await appendAudit(db, {
    orgId: data.orgId,
    actorType: 'agent',
    actorId: data.assigneeId,
    action: 'engineering_task.created',
    outcome: 'success',
  });
  return row;
}

export async function updateEngineeringTask(
  db: Db,
  id: string,
  updates: Partial<Pick<EngineeringTask, 'status' | 'testsSummary' | 'lintSummary' | 'buildSummary' | 'diffSummary' | 'prId' | 'qaResult' | 'completedAt' | 'acceptanceCriteria' | 'description' | 'branch'>>,
): Promise<EngineeringTask | undefined> {
  const rows = await db
    .update(engineeringTasks)
    .set(updates as Partial<EngineeringTask>)
    .where(eq(engineeringTasks.id, id))
    .returning();
  return rows[0];
}

/**
 * Record an engineering lesson into company memory so future engineering
 * tasks and the Executive Agent benefit from what was learned. Reuses the
 * semantic memory pipeline — no separate knowledge store.
 */
export async function recordEngineeringLesson(
  db: Db,
  orgId: string,
  data: { title: string; body: string; agentId?: string; taskId?: string; importance?: number },
): Promise<void> {
  await createMemory(db, {
    orgId,
    category: 'lesson',
    content: `Engineering lesson — ${data.title}: ${data.body}`,
    importance: data.importance ?? 6,
    source: data.taskId ? `engineering:${data.taskId}` : 'engineering',
    agentId: data.agentId,
  });
}
