import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import {
  briefings,
  creditAlerts,
  creditReservations,
  creditTransactions,
  deals,
  files,
  knowledgeEntities,
  repositories,
  engineeringTasks,
  repositoryPrs,
  sandboxRuns,
  tickets,
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

// ─── Finance ────────────────────────────────────────────────────

/**
 * Finance focus (docs/86 §6) — budgets, and the spend that met them.
 *
 * Grounding, stated because it decides what this page may claim: ORQ8 keeps no
 * invoices and no accounting ledger. What it does keep is real money in this
 * product's unit of account — the credit ledger every task, tool and model call
 * writes to, each employee's lifetime `credits_used`, the department's own
 * `budget`, the live holds taken before work runs, and the balance alerts the
 * company received. That is a budget-and-spend board, and it is named as one
 * rather than as accounts payable.
 *
 * Scope is not uniform and the shape records it:
 *   * `spend` and `holds` are the department's own employees (an agent column
 *     exists on both), so they answer "what did this department spend".
 *   * `purchases` and `alerts` are workspace-wide: a credit top-up and a
 *     low-balance alert belong to the company, not to a person.
 *
 * `burnPct` is deliberately computed the same way as the department's
 * `budgetBurnPct` metric — lifetime credits burned by its members against its
 * budget — so the two numbers on one page cannot disagree.
 */
export interface FinanceFocusLedgerLine {
  id: string;
  description: string | null;
  amount: number;
  type: string;
  agentId: string | null;
  createdAt: Date;
}

export interface FinanceFocusHold {
  id: string;
  agentId: string | null;
  estimateCredits: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface FinanceFocusAlert {
  id: string;
  type: string;
  threshold: number;
  message: string;
  sentAt: Date;
  readAt: Date | null;
}

export interface FinanceFocus {
  /** The department's own budget, in credits. Null when none was set. */
  budget: number | null;
  /** Member-scoped: what this department's employees consumed. */
  spend: FinanceFocusLedgerLine[];
  /** Member-scoped: credits held right now for work in flight. */
  holds: FinanceFocusHold[];
  /** Workspace-wide: a purchase is the company's, not an employee's. */
  purchases: FinanceFocusLedgerLine[];
  /** Workspace-wide: balance alerts are about the org balance. */
  alerts: FinanceFocusAlert[];
  counts: {
    spendCredits30d: number;
    spendEvents30d: number;
    holdsActive: number;
    holdsCredits: number;
    purchasesCredits30d: number;
    unreadAlerts: number;
    /** Members' lifetime burn against the budget; null when no budget is set. */
    burnPct: number | null;
  };
}

const LEDGER_LIMIT = 8;
const ALERT_LIMIT = 5;

/**
 * Finance focus for one department. Reads only; every query is org-scoped
 * first, so a department can never see another tenant's money.
 */
export async function financeFocus(
  db: Db,
  orgId: string,
  memberIds: string[],
  opts: { budget: number | null; lifetimeCreditsUsed: number },
): Promise<FinanceFocus> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const budget = opts.budget && opts.budget > 0 ? opts.budget : null;

  const empty: FinanceFocus = {
    budget,
    spend: [],
    holds: [],
    purchases: [],
    alerts: [],
    counts: {
      spendCredits30d: 0,
      spendEvents30d: 0,
      holdsActive: 0,
      holdsCredits: 0,
      purchasesCredits30d: 0,
      unreadAlerts: 0,
      burnPct: budget
        ? Math.round((opts.lifetimeCreditsUsed / budget) * 100)
        : null,
    },
  };

  // Workspace-level rows first — a purchase and an alert have no employee.
  const [purchaseRows, alertRows] = await Promise.all([
    db
      .select({
        id: creditTransactions.id,
        description: creditTransactions.description,
        amount: creditTransactions.amount,
        type: creditTransactions.type,
        agentId: creditTransactions.agentId,
        createdAt: creditTransactions.createdAt,
      })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.orgId, orgId),
          eq(creditTransactions.type, 'purchase'),
          gte(creditTransactions.createdAt, since),
        ),
      )
      .orderBy(desc(creditTransactions.createdAt))
      .limit(LEDGER_LIMIT),
    db
      .select({
        id: creditAlerts.id,
        type: creditAlerts.type,
        threshold: creditAlerts.threshold,
        message: creditAlerts.message,
        sentAt: creditAlerts.sentAt,
        readAt: creditAlerts.readAt,
      })
      .from(creditAlerts)
      .where(and(eq(creditAlerts.orgId, orgId), isNull(creditAlerts.readAt)))
      .orderBy(desc(creditAlerts.sentAt))
      .limit(ALERT_LIMIT),
  ]);

  if (memberIds.length === 0) {
    return {
      ...empty,
      purchases: purchaseRows,
      alerts: alertRows,
      counts: {
        ...empty.counts,
        purchasesCredits30d: purchaseRows.reduce((a, r) => a + Math.max(0, r.amount), 0),
        unreadAlerts: alertRows.length,
      },
    };
  }

  const [spendRows, holdRows] = await Promise.all([
    db
      .select({
        id: creditTransactions.id,
        description: creditTransactions.description,
        amount: creditTransactions.amount,
        type: creditTransactions.type,
        agentId: creditTransactions.agentId,
        createdAt: creditTransactions.createdAt,
      })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.orgId, orgId),
          eq(creditTransactions.type, 'usage'),
          inArray(creditTransactions.agentId, memberIds),
          gte(creditTransactions.createdAt, since),
        ),
      )
      .orderBy(desc(creditTransactions.createdAt))
      .limit(LEDGER_LIMIT),
    db
      .select({
        id: creditReservations.id,
        agentId: creditReservations.agentId,
        estimateCredits: creditReservations.estimateCredits,
        status: creditReservations.status,
        expiresAt: creditReservations.expiresAt,
        createdAt: creditReservations.createdAt,
      })
      .from(creditReservations)
      .where(
        and(
          eq(creditReservations.orgId, orgId),
          eq(creditReservations.status, 'active'),
          inArray(creditReservations.agentId, memberIds),
        ),
      )
      .orderBy(desc(creditReservations.createdAt))
      .limit(LEDGER_LIMIT),
  ]);

  // Usage rows are written as negative amounts (consume); report the magnitude
  // so the page never has to decide what sign to print.
  const spent = spendRows.reduce((a, r) => a + Math.abs(r.amount), 0);

  return {
    budget,
    spend: spendRows,
    holds: holdRows,
    purchases: purchaseRows,
    alerts: alertRows,
    counts: {
      spendCredits30d: spent,
      spendEvents30d: spendRows.length,
      holdsActive: holdRows.length,
      holdsCredits: holdRows.reduce((a, r) => a + Math.max(0, r.estimateCredits), 0),
      purchasesCredits30d: purchaseRows.reduce((a, r) => a + Math.max(0, r.amount), 0),
      unreadAlerts: alertRows.length,
      burnPct: budget
        ? Math.round((opts.lifetimeCreditsUsed / budget) * 100)
        : null,
    },
  };
}

// ─── Marketing ────────────────────────────────────────────────────

/**
 * Marketing focus (docs/86 §6) — what this department actually produced.
 *
 * Grounding, stated for the same reason as finance's: ORQ8 has no campaigns
 * table and no experiment table it writes to, so a "campaign" board would be
 * invention. What marketing's employees really leave behind in this product is
 * output — the assets they created (files carry the creating agent) — and the
 * company briefings the workspace generated. Both are real rows; neither is a
 * guess. When campaigns get a table, this is where they belong.
 *
 * Scope: `assets` is member-scoped (a file records the agent that made it);
 * `briefings` is workspace-wide (the briefing table has no agent column), so
 * the panel labels it as the company's content rather than this department's.
 */
export interface MarketingFocusAsset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  agentId: string | null;
  taskId: string | null;
  createdAt: Date;
}

export interface MarketingFocusBriefing {
  id: string;
  kind: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  deliveredAt: Date | null;
  createdAt: Date;
}

export interface MarketingFocus {
  /** Member-scoped: assets this department's employees produced. */
  assets: MarketingFocusAsset[];
  /** Workspace-wide: the briefing table records no owning employee. */
  briefings: MarketingFocusBriefing[];
  counts: {
    assets: number;
    assets30d: number;
    assetsBytes: number;
    briefings: number;
    briefingsDelivered: number;
  };
}

const ASSET_LIMIT = 8;
const BRIEFING_LIMIT = 5;

/**
 * Marketing focus for one department. Reads only; org-scoped first, so no
 * department can enumerate another tenant's files.
 */
export async function marketingFocus(
  db: Db,
  orgId: string,
  memberIds: string[],
): Promise<MarketingFocus> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const briefingRows = await db
    .select({
      id: briefings.id,
      kind: briefings.kind,
      status: briefings.status,
      periodStart: briefings.periodStart,
      periodEnd: briefings.periodEnd,
      deliveredAt: briefings.deliveredAt,
      createdAt: briefings.createdAt,
    })
    .from(briefings)
    .where(eq(briefings.orgId, orgId))
    .orderBy(desc(briefings.createdAt))
    .limit(BRIEFING_LIMIT);

  const empty: MarketingFocus = {
    assets: [],
    briefings: briefingRows,
    counts: {
      assets: 0,
      assets30d: 0,
      assetsBytes: 0,
      briefings: briefingRows.length,
      briefingsDelivered: briefingRows.filter((b) => b.status === 'delivered').length,
    },
  };
  if (memberIds.length === 0) return empty;

  const assetRows = await db
    .select({
      id: files.id,
      name: files.name,
      mimeType: files.mimeType,
      size: files.size,
      agentId: files.agentId,
      taskId: files.taskId,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(and(eq(files.orgId, orgId), inArray(files.agentId, memberIds)))
    .orderBy(desc(files.createdAt))
    .limit(ASSET_LIMIT);

  return {
    assets: assetRows,
    briefings: briefingRows,
    counts: {
      assets: assetRows.length,
      assets30d: assetRows.filter((a) => a.createdAt >= since).length,
      assetsBytes: assetRows.reduce((a, f) => a + Math.max(0, f.size), 0),
      briefings: briefingRows.length,
      briefingsDelivered: briefingRows.filter((b) => b.status === 'delivered').length,
    },
  };
}

// ─── Accounts (the customer record both boards read) ───────────────

/**
 * Accounts focus (docs/86 §6) — the customer accounts the company knows.
 *
 * This is the one first-class customer record: the knowledge graph's
 * `customer` entity, written by business import and by the agents when they
 * learn something about a customer. It is no longer the *whole* sales or
 * customer-success board — since migration `0054` those departments have their
 * own `deals` and `tickets` tables, and their read-models are genuinely
 * different (see `salesFocus` / `successFocus`). This model now supplies the
 * account list both boards show alongside their own rows.
 *
 * Scope: workspace-wide. `knowledge_entities` records no owning employee, so
 * nothing here is attributed to the department — the panel says so.
 */
export interface AccountsFocusAccount {
  id: string;
  name: string;
  summary: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountsFocus {
  accounts: AccountsFocusAccount[];
  counts: {
    accounts: number;
    accountsNew30d: number;
  };
}

const ACCOUNT_LIMIT = 8;

/** Customer accounts known to this org. Org-scoped; never another tenant's. */
export async function accountsFocus(db: Db, orgId: string): Promise<AccountsFocus> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: knowledgeEntities.id,
      name: knowledgeEntities.name,
      summary: knowledgeEntities.summary,
      source: knowledgeEntities.source,
      createdAt: knowledgeEntities.createdAt,
      updatedAt: knowledgeEntities.updatedAt,
    })
    .from(knowledgeEntities)
    .where(and(eq(knowledgeEntities.orgId, orgId), eq(knowledgeEntities.type, 'customer')))
    .orderBy(desc(knowledgeEntities.updatedAt))
    .limit(ACCOUNT_LIMIT);

  return {
    accounts: rows,
    counts: {
      accounts: rows.length,
      accountsNew30d: rows.filter((a) => a.createdAt >= since).length,
    },
  };
}

// ─── Sales (deals, migration 0054) ─────────────────────────────────

/**
 * Sales focus (docs/86 §6, docs/87 §4 item 3) — the pipeline.
 *
 * Before `0054` this board and the customer-success one shared a single
 * `accountsFocus` model, because ORQ8 had no deals table: a "pipeline" printed
 * from `knowledge_entities` would have been a number nobody wrote. Now it is
 * real rows — each deal's account, stage, value in cents, owner and expected
 * close — and the board is the department's own.
 *
 * Scope is not uniform and the shape records it:
 *   * `pipeline` and `stages` are member-scoped: a deal has an
 *     `owner_agent_id`, so they answer "what is this department selling".
 *   * `accounts` is workspace-wide (the knowledge graph records no owning
 *     employee) — the panel labels it as the company's, not this department's.
 *
 * `weightedValueCents` is derived, not stored: value × probability. It is
 * labelled as an estimate wherever it is printed, because it is one.
 *
 * Counts are computed over every open deal the department owns (bounded by
 * `SCAN_LIMIT`), not over the display slice, so the headline figures cannot be
 * silently cut off at eight rows.
 */
export interface SalesFocusDeal {
  id: string;
  title: string;
  accountName: string;
  stage: string;
  valueCents: number;
  currency: string;
  probability: number;
  ownerAgentId: string | null;
  nextStep: string | null;
  expectedCloseAt: Date | null;
  updatedAt: Date;
}

export interface SalesFocusStage {
  stage: string;
  count: number;
  valueCents: number;
}

export interface SalesFocus {
  /** Member-scoped: open deals this department owns, newest activity first. */
  pipeline: SalesFocusDeal[];
  /** Member-scoped: the same rows, bucketed by stage, in pipeline order. */
  stages: SalesFocusStage[];
  /** Workspace-wide: the customer accounts the company knows. */
  accounts: AccountsFocusAccount[];
  counts: {
    openDeals: number;
    pipelineValueCents: number;
    /** value × probability, across the open pipeline. An estimate. */
    weightedValueCents: number;
    /** Open deals expected to close within 30 days. */
    closingSoon: number;
    won30d: number;
    lost30d: number;
    /** Workspace-wide: open deals nobody owns — unclaimed pipeline. */
    unassigned: number;
    /** closed-won / (closed-won + closed-lost), over all time. Null when none closed. */
    winRatePct: number | null;
    accounts: number;
  };
}

const DEAL_LIMIT = 8;
const SCAN_LIMIT = 200;

/** Pipeline order for the stage buckets; won/lost are terminal. */
export const DEAL_STAGES = [
  'qualifying',
  'discovery',
  'proposal',
  'negotiation',
] as const;
const DEAL_TERMINAL = ['won', 'lost'];

/**
 * Sales focus for one department. Reads only; every query is org-scoped first,
 * so a department can never see another tenant's pipeline.
 */
export async function salesFocus(
  db: Db,
  orgId: string,
  memberIds: string[],
): Promise<SalesFocus> {
  const now = Date.now();
  const soon = new Date(now + 30 * 24 * 60 * 60 * 1000);
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Workspace-wide rows first — an account has no owning employee.
  const [accountRows, unassignedRows] = await Promise.all([
    accountsFocus(db, orgId),
    db
      .select({ id: deals.id })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          isNull(deals.ownerAgentId),
          isNull(deals.closedAt),
        ),
      ),
  ]);

  const accounts = accountRows.accounts;
  const empty: SalesFocus = {
    pipeline: [],
    stages: [],
    accounts,
    counts: {
      openDeals: 0,
      pipelineValueCents: 0,
      weightedValueCents: 0,
      closingSoon: 0,
      won30d: 0,
      lost30d: 0,
      unassigned: unassignedRows.length,
      winRatePct: null,
      accounts: accounts.length,
    },
  };
  if (memberIds.length === 0) return empty;

  const owned = await db
    .select({
      id: deals.id,
      title: deals.title,
      accountName: deals.accountName,
      stage: deals.stage,
      valueCents: deals.valueCents,
      currency: deals.currency,
      probability: deals.probability,
      ownerAgentId: deals.ownerAgentId,
      nextStep: deals.nextStep,
      expectedCloseAt: deals.expectedCloseAt,
      closedAt: deals.closedAt,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), inArray(deals.ownerAgentId, memberIds)))
    .orderBy(desc(deals.updatedAt))
    .limit(SCAN_LIMIT);

  const open = owned.filter((d) => !DEAL_TERMINAL.includes(d.stage));
  const won = owned.filter((d) => d.stage === 'won');
  const lost = owned.filter((d) => d.stage === 'lost');
  const won30d = won.filter((d) => (d.closedAt ?? d.updatedAt) >= since).length;
  const lost30d = lost.filter((d) => (d.closedAt ?? d.updatedAt) >= since).length;
  const decided = won.length + lost.length;

  const value = (rows: typeof open) =>
    rows.reduce((a, d) => a + Math.max(0, d.valueCents), 0);

  const stages: SalesFocusStage[] = DEAL_STAGES.map((stage) => {
    const rows = open.filter((d) => d.stage === stage);
    return { stage, count: rows.length, valueCents: value(rows) };
  });

  return {
    pipeline: open.slice(0, DEAL_LIMIT),
    stages,
    accounts,
    counts: {
      openDeals: open.length,
      pipelineValueCents: value(open),
      weightedValueCents: open.reduce(
        (a, d) => a + Math.round((Math.max(0, d.valueCents) * Math.min(100, Math.max(0, d.probability))) / 100),
        0,
      ),
      closingSoon: open.filter((d) => d.expectedCloseAt != null && d.expectedCloseAt <= soon).length,
      won30d,
      lost30d,
      unassigned: unassignedRows.length,
      winRatePct: decided > 0 ? Math.round((won.length / decided) * 100) : null,
      accounts: accounts.length,
    },
  };
}

// ─── Customer success (tickets, migration 0054) ────────────────────

/**
 * Customer-success focus (docs/86 §6, docs/87 §4 item 3) — the support queue.
 *
 * The same follow-up as sales, from the other side: `0054` gave this board a
 * real `tickets` table, so "open queue", "escalated" and "SLA breached" are
 * counted from rows an employee actually recorded rather than inferred.
 *
 * Scope, stated for the same reason:
 *   * `queue` is member-scoped (a ticket has an `assignee_agent_id`), so it is
 *     this department's queue.
 *   * `unassigned` is workspace-wide: an unclaimed ticket belongs to nobody, so
 *     attributing it to this department would be wrong. It is a headline
 *     count, and the panel says it is the workspace's.
 *   * `accounts` is workspace-wide for the same reason as sales'.
 *
 * `slaBreached` is only ever counted against a ticket that is still open and
 * has a due date in the past — a resolved ticket that missed its SLA is
 * history, not a live breach. Both are reported (`slaBreached`, and the closed
 * ones fall outside the count) so the number cannot be read as either.
 */
export interface SuccessFocusTicket {
  id: string;
  subject: string;
  accountName: string;
  status: string;
  priority: string;
  channel: string;
  assigneeAgentId: string | null;
  slaDueAt: Date | null;
  firstResponseAt: Date | null;
  updatedAt: Date;
}

export interface SuccessFocus {
  /** Member-scoped: open tickets this department is on, most urgent first. */
  queue: SuccessFocusTicket[];
  /** Workspace-wide: the customer accounts the company knows. */
  accounts: AccountsFocusAccount[];
  counts: {
    open: number;
    escalated: number;
    urgent: number;
    /** Workspace-wide: open tickets nobody is assigned to. */
    unassigned: number;
    /** Member-scoped: open tickets whose due date has passed. */
    slaBreached: number;
    /** Member-scoped: open tickets with no first response recorded yet. */
    awaitingFirstResponse: number;
    resolved30d: number;
    accounts: number;
  };
}

const TICKET_LIMIT = 8;
/** Closed states: a ticket here is history, not queue. */
const TICKET_CLOSED = ['resolved', 'closed'];
/** Display order for the queue — most urgent first. */
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * Customer-success focus for one department. Reads only; org-scoped first, so a
 * department can never see another tenant's customers.
 */
export async function successFocus(
  db: Db,
  orgId: string,
  memberIds: string[],
): Promise<SuccessFocus> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Workspace-wide rows first — an unassigned ticket and an account belong to
  // the company, not to an employee.
  const [accountRows, unassignedRows] = await Promise.all([
    accountsFocus(db, orgId),
    db
      .select({ id: tickets.id })
      .from(tickets)
      .where(
        and(
          eq(tickets.orgId, orgId),
          isNull(tickets.assigneeAgentId),
          inArray(tickets.status, ['open', 'pending', 'waiting_customer', 'escalated']),
        ),
      ),
  ]);

  const accounts = accountRows.accounts;
  const empty: SuccessFocus = {
    queue: [],
    accounts,
    counts: {
      open: 0,
      escalated: 0,
      urgent: 0,
      unassigned: unassignedRows.length,
      slaBreached: 0,
      awaitingFirstResponse: 0,
      resolved30d: 0,
      accounts: accounts.length,
    },
  };
  if (memberIds.length === 0) return empty;

  const assigned = await db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      accountName: tickets.accountName,
      status: tickets.status,
      priority: tickets.priority,
      channel: tickets.channel,
      assigneeAgentId: tickets.assigneeAgentId,
      slaDueAt: tickets.slaDueAt,
      firstResponseAt: tickets.firstResponseAt,
      resolvedAt: tickets.resolvedAt,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .where(and(eq(tickets.orgId, orgId), inArray(tickets.assigneeAgentId, memberIds)))
    .orderBy(desc(tickets.updatedAt))
    .limit(SCAN_LIMIT);

  const open = assigned.filter((t) => !TICKET_CLOSED.includes(t.status));
  const sorted = [...open].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  return {
    queue: sorted.slice(0, TICKET_LIMIT),
    accounts,
    counts: {
      open: open.length,
      escalated: open.filter((t) => t.status === 'escalated').length,
      urgent: open.filter((t) => t.priority === 'urgent').length,
      unassigned: unassignedRows.length,
      slaBreached: open.filter((t) => t.slaDueAt != null && t.slaDueAt < now).length,
      awaitingFirstResponse: open.filter((t) => t.firstResponseAt == null).length,
      resolved30d: assigned.filter(
        (t) => TICKET_CLOSED.includes(t.status) && (t.resolvedAt ?? t.updatedAt) >= since,
      ).length,
      accounts: accounts.length,
    },
  };
}
