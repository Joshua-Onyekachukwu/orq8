import { and, desc, eq, inArray, or } from 'drizzle-orm';
import {
  repositories,
  engineeringTasks,
  repositoryPrs,
  sandboxRuns,
  type Db,
} from '@orq8/db';

/**
 * Department focus read-models (docs/86 §6).
 *
 * A department page should be about the department's actual work, not a generic
 * dashboard. The engineering surfaces already exist as org-wide endpoints
 * (/v1/repositories, /v1/prs, /v1/sandbox-runs, /v1/engineering-tasks), so this
 * does NOT invent new tables or concepts — it *scopes* the existing ones to a
 * department's members and shapes them for one section.
 *
 * Scope honesty matters here, and the shape records it:
 *   * `work` and `reviews` are filtered to the department's members (by
 *     assigneeId / authorId), so they answer "what is this department doing".
 *   * `repositories` and `sandbox` have no agent column at all — repositories
 *     are org-level systems and sandbox runs hang off a repository. They are
 *     returned as workspace-wide and the UI must label them as such rather
 *     than implying the department owns them.
 */

export interface EngineeringFocusWork {
  id: string;
  title: string;
  status: string;
  branch: string;
  assigneeId: string;
  prId: string | null;
  updatedAt: Date;
}

export interface EngineeringFocusReview {
  id: string;
  title: string;
  status: string;
  state: string;
  headBranch: string;
  repositoryId: string;
  updatedAt: Date;
}

export interface EngineeringFocusRepository {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  lastSyncedAt: Date;
}

export interface EngineeringFocusSandbox {
  id: string;
  command: string;
  state: string;
  exitCode: number | null;
  startedAt: Date | null;
}

export interface EngineeringFocus {
  /** Member-scoped. */
  work: EngineeringFocusWork[];
  /** Member-scoped: PRs this department's employees authored. */
  reviews: EngineeringFocusReview[];
  /** Workspace-wide (no agent column exists). */
  repositories: EngineeringFocusRepository[];
  /** Workspace-wide: sandbox runs belong to a repository, not an employee. */
  sandbox: EngineeringFocusSandbox[];
  counts: {
    repositories: number;
    workOpen: number;
    workCompleted: number;
    workFailed: number;
    reviewsOpen: number;
    sandboxRunning: number;
  };
}

const WORK_LIMIT = 8;
const REVIEW_LIMIT = 6;
const REPO_LIMIT = 8;
const SANDBOX_LIMIT = 6;

/**
 * Engineering focus for one department. Reads only; every query is org-scoped
 * first, so a department can never see another tenant's repositories.
 */
export async function engineeringFocus(
  db: Db,
  orgId: string,
  memberIds: string[],
): Promise<EngineeringFocus> {
  const empty: EngineeringFocus = {
    work: [],
    reviews: [],
    repositories: [],
    sandbox: [],
    counts: {
      repositories: 0,
      workOpen: 0,
      workCompleted: 0,
      workFailed: 0,
      reviewsOpen: 0,
      sandboxRunning: 0,
    },
  };

  // Workspace-level rows first — they do not depend on membership.
  const [repoRows, sandboxRows] = await Promise.all([
    db
      .select({
        id: repositories.id,
        name: repositories.name,
        fullName: repositories.fullName,
        defaultBranch: repositories.defaultBranch,
        lastSyncedAt: repositories.lastSyncedAt,
      })
      .from(repositories)
      .where(eq(repositories.orgId, orgId))
      .orderBy(desc(repositories.lastSyncedAt))
      .limit(REPO_LIMIT),
    db
      .select({
        id: sandboxRuns.id,
        command: sandboxRuns.command,
        state: sandboxRuns.state,
        exitCode: sandboxRuns.exitCode,
        startedAt: sandboxRuns.startedAt,
      })
      .from(sandboxRuns)
      .where(eq(sandboxRuns.orgId, orgId))
      .orderBy(desc(sandboxRuns.createdAt))
      .limit(SANDBOX_LIMIT),
  ]);

  if (memberIds.length === 0) {
    return {
      ...empty,
      repositories: repoRows,
      sandbox: sandboxRows,
      counts: { ...empty.counts, repositories: repoRows.length },
    };
  }

  const [workRows, reviewRows] = await Promise.all([
    db
      .select({
        id: engineeringTasks.id,
        title: engineeringTasks.title,
        status: engineeringTasks.status,
        branch: engineeringTasks.branch,
        assigneeId: engineeringTasks.assigneeId,
        prId: engineeringTasks.prId,
        updatedAt: engineeringTasks.updatedAt,
      })
      .from(engineeringTasks)
      .where(and(eq(engineeringTasks.orgId, orgId), inArray(engineeringTasks.assigneeId, memberIds)))
      .orderBy(desc(engineeringTasks.updatedAt))
      .limit(WORK_LIMIT),
    db
      .select({
        id: repositoryPrs.id,
        title: repositoryPrs.title,
        status: repositoryPrs.status,
        state: repositoryPrs.state,
        headBranch: repositoryPrs.headBranch,
        repositoryId: repositoryPrs.repositoryId,
        updatedAt: repositoryPrs.updatedAt,
      })
      .from(repositoryPrs)
      .innerJoin(repositories, eq(repositories.id, repositoryPrs.repositoryId))
      .where(
        and(
          eq(repositories.orgId, orgId),
          inArray(repositoryPrs.authorId, memberIds),
          // Author may be a human or an employee; both count as this
          // department's output, so the filter is on id, not authorType.
          or(eq(repositoryPrs.state, 'open'), eq(repositoryPrs.state, 'draft')),
        ),
      )
      .orderBy(desc(repositoryPrs.updatedAt))
      .limit(REVIEW_LIMIT),
  ]);

  const openWork = workRows.filter(
    (w) => w.status !== 'completed' && w.status !== 'failed',
  ).length;

  return {
    work: workRows,
    reviews: reviewRows,
    repositories: repoRows,
    sandbox: sandboxRows,
    counts: {
      repositories: repoRows.length,
      workOpen: openWork,
      workCompleted: workRows.filter((w) => w.status === 'completed').length,
      workFailed: workRows.filter((w) => w.status === 'failed').length,
      reviewsOpen: reviewRows.length,
      sandboxRunning: sandboxRows.filter(
        (s) => s.state === 'running' || s.state === 'queued',
      ).length,
    },
  };
}
