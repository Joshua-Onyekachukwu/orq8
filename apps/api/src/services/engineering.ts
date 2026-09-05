import { eq, and, desc, asc } from 'drizzle-orm';
import {
  repositories,
  repositoryBranches,
  repositoryFiles,
  repositoryFileContents,
  repoEvents,
  sandboxRuns,
  repositoryPrs,
  engineeringTasks,
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
  updates: Partial<Pick<SandboxRun, 'state' | 'stdout' | 'stderr' | 'exitCode' | 'resultSummary' | 'startedAt' | 'finishedAt' | 'usedCredits' | 'allocatedCredits'>>,
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

export async function createPr(db: Db, data: NewRepositoryPr): Promise<RepositoryPr> {
  const rows = await db.insert(repositoryPrs).values(data).returning();
  const row = rows[0];
  if (!row) throw new Error('createPr returned no row');
  await appendAudit(db, {
    orgId: data.repositoryId,
    actorType: 'agent',
    actorId: data.authorId,
    action: 'pr.created',
    outcome: 'success',
  });
  return row;
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
