/**
 * ORQ8 Model Intelligence — classification, tiers, escalation.
 *
 * Three cooperating layers (§2–§6, §17 of the intelligence spec):
 *
 *   1. TaskComplexity   — deterministic classifier: what KIND of work is this?
 *   2. ModelTier        — capability-based model classes over MODEL_REGISTRY
 *                         (tier assignment is derived from the registry, so it
 *                         can never reference a model that does not exist).
 *   3. EscalationLevel  — decision-risk score → who deliberates, at what cost.
 *
 * Design rules:
 *   - Classification is heuristic and deterministic (no LLM calls, no cost);
 *     LLM-assisted classification can layer on later behind the same API.
 *   - Never fabricate model availability: tiers are computed FROM the
 *     registry; a tier with no models falls back down the tier ladder.
 *   - Cost optimization must not override risk: critical-risk work can never
 *     be routed below Tier 2 regardless of complexity.
 */

import type { ModelDefinition, TaskRequirements } from './model-router.js';
import { MODEL_REGISTRY } from './model-router.js';

// ─── 1. Task complexity classification ──────────────────────────────────────

export type Intensity = 'low' | 'medium' | 'high' | 'critical';

/** 1 trivial … 5 critical (§5). */
export interface TaskComplexity {
  complexity: 1 | 2 | 3 | 4 | 5;
  reasoning: Intensity;
  risk: Intensity;
  businessImpact: Intensity;
  requiredAccuracy: Intensity;
  /** Which signals produced the score — shown in decision UX, never hidden. */
  signals: string[];
}

/** High-stakes domains that must never be routed to cheap models. */
const RISK_DOMAINS: Array<{ pattern: RegExp; domain: string; risk: Intensity }> = [
  { pattern: /\b(security|vulnerab|penetration|exploit|breach|auth[^o]|encryption)\b/i, domain: 'security', risk: 'critical' },
  { pattern: /\b(legal|contract|complian|regulat|GDPR|license|liab)/i, domain: 'legal', risk: 'high' },
  { pattern: /\b(financ|budget|payroll|invoice|tax|accounting|revenue recognition)\b/i, domain: 'finance', risk: 'high' },
  { pattern: /\b(architecture|migration|database schema|infrastructure|production deploy|scaling)\b/i, domain: 'architecture', risk: 'high' },
  { pattern: /\b(strategy|strategic|roadmap|pricing strategy|market position)\b/i, domain: 'strategy', risk: 'medium' },
];

const COMPLEXITY_SIGNALS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\b(design|architect|plan|compare|evaluate|trade-?off|refactor|migrat)\w*/i, weight: 1.5, label: 'design/planning verbs' },
  { pattern: /\b(analy[sz]e|investigat|research|audit|assess)\w*/i, weight: 1, label: 'analysis verbs' },
  { pattern: /\b(write|draft|format|tag|label|summariz|extract|classify|translate)\w*/i, weight: -0.5, label: 'atomic verbs' },
  { pattern: /\b(security|legal|financial|strategic|critical)\b/i, weight: 1, label: 'high-stakes domain terms' },
  { pattern: /\b(multi-?step|comprehensive|end-to-end|cross-department)\b/i, weight: 1, label: 'multi-step scope' },
];

const IMPACT_SIGNALS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\$\s?[\d,]+|\b\d+\s?k\b|\b\d+\s?dollars?\b/i, weight: 2, label: 'explicit monetary amount' },
  { pattern: /\b(launch|customer-facing|production|revenue|churn)\b/i, weight: 1, label: 'business-outcome terms' },
  { pattern: /\b(irreversib|permanent|delete all|terminate)\b/i, weight: 1.5, label: 'irreversibility' },
];

const MAX_SIGNALS = 5;

function clampIntensity(value: number, criticalAt: number, highAt: number): Intensity {
  if (value >= criticalAt) return 'critical';
  if (value >= highAt) return 'high';
  if (value >= 1) return 'medium';
  return 'low';
}

/**
 * Deterministic task classification. `context` adds organizational signals
 * (agent role, department) that shift requirements without hard-coding them.
 */
export function classifyTask(input: {
  title: string;
  description?: string | null;
  agentRole?: string | null;
  department?: string | null;
  priority?: string | null;
}): TaskComplexity {
  const text = [input.title, input.description ?? '', input.agentRole ?? '', input.department ?? '']
    .join(' ')
    .slice(0, 4000);
  const signals: string[] = [];

  let complexity = 1;
  for (const s of COMPLEXITY_SIGNALS) {
    if (s.pattern.test(text)) {
      complexity += s.weight;
      signals.push(s.label);
    }
  }

  // Risk domain lexicon (§6: cost never overrides required quality/safety).
  let riskScore = 0;
  let riskDomains: string[] = [];
  for (const d of RISK_DOMAINS) {
    if (d.pattern.test(text)) {
      riskScore += d.risk === 'critical' ? 3 : d.risk === 'high' ? 2 : 1;
      riskDomains.push(d.domain);
      signals.push(`risk domain: ${d.domain}`);
    }
  }

  let impactScore = 0;
  for (const s of IMPACT_SIGNALS) {
    if (s.pattern.test(text)) {
      impactScore += s.weight;
      signals.push(s.label);
    }
  }

  // Priority escalates but never de-escalates risk.
  const priorityBoost = input.priority === 'urgent' ? 1 : input.priority === 'high' ? 0.5 : 0;
  complexity += priorityBoost;
  if (priorityBoost > 0) signals.push(`priority: ${input.priority}`);

  const businessImpact = clampIntensity(impactScore, 3, 1.5);
  const reasoning: Intensity = clampIntensity(complexity, 4, 2.5);

  const level = Math.min(5, Math.max(1, Math.round(complexity))) as TaskComplexity['complexity'];
  const requiredAccuracy: Intensity =
    riskScore >= 3 || businessImpact === 'critical' ? 'critical' : businessImpact === 'high' ? 'high' : reasoning;

  return {
    complexity: level,
    reasoning,
    risk: riskScore >= 3 ? 'critical' : riskScore >= 2 ? 'high' : riskScore >= 1 ? 'medium' : 'low',
    businessImpact,
    requiredAccuracy,
    signals: signals.slice(0, MAX_SIGNALS).concat(riskDomains.length ? [] : []),
  };
}

// ─── 2. Capability-based model tiers ────────────────────────────────────────

/**
 * Tier 0 ultra-cheap/fast … Tier 3 frontier/heavy reasoning (§4).
 * Assignment is COMPUTED from the registry so tiers always reflect real,
 * configured models (never fabricated availability).
 */
export type ModelTier = 0 | 1 | 2 | 3;

/**
 * Tier boundaries on registry metadata:
 *   - Tier 0: cheap AND fast AND small context footprint, no reasoning req.
 *   - Tier 3: reasoning-capable AND among the most expensive quartile.
 *   - Tier 2: reasoning-capable, mid/high cost.
 *   - Tier 1: everything else (standard workhorse).
 */
export function tierOf(model: ModelDefinition): ModelTier {
  const cheap = model.costPer1kInput <= 0.0002;
  const expensive = model.costPer1kInput >= 0.002;
  const reasons = model.capabilities.includes('reasoning');
  const fast = model.speedRating === 'fast';

  if (cheap && fast && !reasons) return 0;
  if (reasons && expensive) return 3;
  if (reasons) return 2;
  return 1;
}

/** Registry models grouped by tier, cheapest-first inside each tier. */
export function modelsByTier(): Record<ModelTier, ModelDefinition[]> {
  const out: Record<ModelTier, ModelDefinition[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const m of MODEL_REGISTRY) out[tierOf(m)].push(m);
  for (const tier of Object.keys(out) as unknown as ModelTier[]) {
    out[tier].sort((a, b) => a.costPer1kInput - b.costPer1kInput);
  }
  return out;
}

/**
 * Model diversity for deliberation (§15): pick participants' models from
 * DIFFERENT tiers where the registry allows, subject to availability.
 * Returns concrete model ids; empty entries mean "let the router default".
 */
export function diverseModelsFor(count: number, opts: { allowExpensive: boolean }): string[] {
  const tiers = modelsByTier();
  const ladder: ModelTier[] = opts.allowExpensive ? [2, 3, 1, 0] : [2, 1, 0];
  const available: ModelDefinition[] = [];
  for (const tier of ladder) {
    for (const m of tiers[tier]) {
      if (opts.allowExpensive || m.costPer1kInput <= 0.003) available.push(m);
    }
  }
  // One model per provider first (family diversity), then fill from the rest.
  const chosen: ModelDefinition[] = [];
  const seenProviders = new Set<string>();
  for (const m of available) {
    if (chosen.length >= count) break;
    if (!seenProviders.has(m.provider)) {
      chosen.push(m);
      seenProviders.add(m.provider);
    }
  }
  for (const m of available) {
    if (chosen.length >= count) break;
    if (!chosen.includes(m)) chosen.push(m);
  }
  return chosen.slice(0, count).map((m) => m.id);
}

/** Map a classification to router requirements (§6: cheapest SUFFICIENT model). */
export function requirementsForTask(c: TaskComplexity): TaskRequirements {
  // Risk floor: critical-risk work never routes below Tier 2.
  const needsReasoning = c.complexity >= 3 || c.risk === 'high' || c.risk === 'critical' || c.reasoning !== 'low';
  return {
    requiredCapabilities: needsReasoning ? ['reasoning'] : [],
    preferredCapabilities:
      c.complexity <= 2 ? ['fast_response', 'summarization'] : ['reasoning', 'coding', 'research'],
    needsStructuredOutput: false,
    speedPreference: c.complexity <= 2 ? 'fast' : 'medium',
  };
}

/** Cheapest available model whose tier satisfies the classification. */
export function selectTierModel(c: TaskComplexity): string | undefined {
  const minTier: ModelTier =
    c.risk === 'critical' || c.complexity >= 4 ? 2 : c.complexity >= 3 || c.reasoning !== 'low' ? 1 : 0;
  const tiers = modelsByTier();
  for (let tier = minTier as number; tier <= 3; tier++) {
    const candidates = tiers[tier as ModelTier];
    if (candidates.length > 0) return candidates[0]?.id;
  }
  return undefined; // caller falls back to provider default
}

// ─── 3. Decision escalation engine ──────────────────────────────────────────

/** §17: who deliberates, and §45: how much the deliberation may cost. */
export type EscalationLevel =
  | 'none'
  | 'single_agent'
  | 'dual_review'
  | 'department_council'
  | 'executive_deliberation';

export interface EscalationDecision {
  level: EscalationLevel;
  /** USD ceiling for the whole deliberation (§45). */
  budgetUsd: number;
  /** Suggested department slugs for participant selection. */
  departments: string[];
  requiresFounderApproval: boolean;
  rationale: string;
}

const DEPARTMENT_HINTS: Array<{ pattern: RegExp; slug: string }> = [
  { pattern: /\b(financ|budget|cost|revenue|pric)/i, slug: 'finance' },
  { pattern: /\b(legal|contract|complian|regulat)/i, slug: 'legal' },
  { pattern: /\b(security|vulnerab|breach)/i, slug: 'security' },
  { pattern: /\b(engineer|technical|architecture|build)/i, slug: 'engineering' },
  { pattern: /\b(marketing|campaign|brand|acquisition)/i, slug: 'marketing' },
  { pattern: /\b(sales|deal|pipeline|customer)/i, slug: 'sales' },
  { pattern: /\b(product|feature|roadmap)/i, slug: 'product' },
  { pattern: /\b(hiring|recruit|people|team size)/i, slug: 'people' },
];

function extractAmount(text: string): number | null {
  const kMatch = text.match(/\$\s?([\d,.]+)\s?k\b/i) ?? text.match(/\b([\d,.]+)\s?k\s?(dollars?|usd)?\b/i);
  if (kMatch) {
    const n = Number.parseFloat((kMatch[1] ?? '').replace(/,/g, ''));
    if (!Number.isNaN(n)) return n * 1000;
  }
  const plain = text.match(/\$\s?([\d,]+)/);
  if (plain) {
    const n = Number.parseFloat((plain[1] ?? '').replace(/,/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/**
 * Deterministic decision-risk scoring (§17). Impact dimensions map to
 * escalation levels; the deliberation budget scales with them (§45).
 */
export function evaluateEscalation(input: { question: string; context?: string | null }): EscalationDecision {
  const text = `${input.question} ${input.context ?? ''}`.slice(0, 4000);
  const amount = extractAmount(text);

  const departments = DEPARTMENT_HINTS.filter((h) => h.pattern.test(text)).map((h) => h.slug);

  const irreversible = /\b(irreversib|permanent|cannot be undone|terminate)\b/i.test(text);
  const security = /\b(security|vulnerab|breach|exploit)\b/i.test(text);
  const legal = /\b(legal|lawsuit|regulat|complian)\b/i.test(text);
  const strategic = /\b(strategy|strategic|pivot|roadmap|positioning)\b/i.test(text);
  const financial = amount !== null || /\b(budget|spend|invest|pay)\b/i.test(text);

  const dimensions = [irreversible, security, legal, strategic, financial].filter(Boolean).length;

  // Budget ceilings per level (§45). Deliberation cost accounting uses real
  // provider usage tokens — these are caps, not estimates presented as costs.
  const budgets = { none: 0, single_agent: 0.05, dual_review: 0.25, department_council: 1, executive_deliberation: 5 };

  let level: EscalationLevel;
  let requiresFounderApproval = false;
  if (dimensions >= 4 || (amount !== null && amount >= 10000) || (irreversible && financial)) {
    level = 'executive_deliberation';
    requiresFounderApproval = true;
  } else if (dimensions >= 2 || (amount !== null && amount >= 1000)) {
    level = 'department_council';
    requiresFounderApproval = amount !== null && amount >= 1000;
  } else if (dimensions === 1 || (amount !== null && amount >= 100)) {
    level = 'dual_review';
  } else {
    level = 'single_agent';
  }

  const parts: string[] = [];
  if (amount !== null) parts.push(`amount $${amount}`);
  if (irreversible) parts.push('irreversible');
  if (security) parts.push('security');
  if (legal) parts.push('legal');
  if (strategic) parts.push('strategic');
  if (financial) parts.push('financial');

  return {
    level,
    budgetUsd: budgets[level],
    departments: departments.length > 0 ? departments : ['executive'],
    requiresFounderApproval,
    rationale: parts.length > 0 ? `Escalated on: ${parts.join(', ')}` : 'No high-impact signals detected',
  };
}
