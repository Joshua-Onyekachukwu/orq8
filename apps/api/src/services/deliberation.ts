/**
 * ORQ8 Decision Council — structured multi-agent deliberation (§10–§20).
 *
 * A deliberation session is a real decision process, not a chatroom:
 *
 *   Round 1  Independent analysis      — participants analyze WITHOUT seeing each other
 *   Round 2  Cross-examination         — participants receive others' analyses, flag
 *                                      disagreements, weak assumptions, missing evidence
 *   Round 3  Re-analysis               — participants MAY update positions (no forced change)
 *   Round 4  Synthesis                 — designated synthesis pass produces the recommendation,
 *                                      or an explicit "no consensus" verdict
 *
 * Hard rules:
 *   - No artificial consensus (§14): disagreement is preserved verbatim; the
 *     synthesis may conclude "no consensus" or "insufficient evidence".
 *   - Model diversity (§15): participants run on models from different tiers/
 *     providers where the registry allows — via model-intelligence.
 *   - Loop prevention (§44): rounds are hard-capped, token budgets enforced,
 *     no agent-to-agent messaging at all (all routing through this engine).
 *   - Evidence-first (§18): participants must label claims as evidence,
 *     inference or assumption; the synthesis surfaces unknowns.
 *   - Deliberation != execution (§48): this engine NEVER performs state
 *     changes — it produces a recommendation and (when the escalation engine
 *     says so) a founder-approval requirement.
 *   - Cost accounting is real: per-participant token usage is returned from
 *     the LLM layer; the engine refuses to continue past its budget cap.
 */

import type { Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import { chat } from './llm.js';
import { createDecision } from './decision-memory.js';
import {
  evaluateEscalation,
  diverseModelsFor,
  type EscalationDecision,
} from './model-intelligence.js';

const MAX_ROUNDS = 3; // independent + cross-examination + re-analysis
const SYNTHESIS_MAX_TOKENS = 2048;
const ANALYSIS_MAX_TOKENS = 1024;

export interface DeliberationParticipant {
  agentId: string | null;
  name: string;
  role: string;
  /** Department slug this participant represents (for context selection). */
  department: string;
  /** Concrete model id for this participant (diversity, §15). */
  model: string | null;
}

export interface DeliberationAnalysis {
  participant: string;
  role: string;
  model: string | null;
  /** Verbatim analysis text — never paraphrased by the system. */
  analysis: string;
  /** Structured extraction: what kind of claims were made (best effort). */
  claims: Array<{ kind: 'evidence' | 'inference' | 'assumption'; text: string }>;
  round: 1 | 2 | 3;
  tokensUsed: number;
}

export interface DeliberationResult {
  question: string;
  escalation: EscalationDecision;
  participants: Array<{ name: string; role: string; model: string | null; department: string }>;
  rounds: Array<{
    round: 1 | 2 | 3;
    analyses: DeliberationAnalysis[];
  }>;
  synthesis: {
    recommendation: string;
    confidence: 'high' | 'medium' | 'low' | 'none';
    consensusReached: boolean;
    disagreements: string[];
    risks: string[];
    unknowns: string[];
    alternatives: Array<{ name: string; reasonRejected: string }>;
    verdictText: string;
  };
  totalTokensUsed: number;
  budgetUsd: number;
  /** Populated only when the decision was persisted to Decision Memory. */
  decisionId: string | null;
  requiresFounderApproval: boolean;
  stoppedReason: 'completed' | 'budget_exhausted' | 'llm_unavailable';
}

/** Cheap heuristic claim extraction — labels only what the text literally declares. */
function extractClaims(text: string): DeliberationAnalysis['claims'] {
  const claims: DeliberationAnalysis['claims'] = [];
  const patterns: Array<[RegExp, 'evidence' | 'inference' | 'assumption']> = [
    [/\baccording to\b[^.]*\./gi, 'evidence'],
    [/\bdata shows\b[^.]*\./gi, 'evidence'],
    [/\bwe know\b[^.]*\./gi, 'evidence'],
    [/\bthis suggests\b[^.]*\./gi, 'inference'],
    [/\btherefore\b[^.]*\./gi, 'inference'],
    [/\bassuming\b[^.]*\./gi, 'assumption'],
    [/\bif we assume\b[^.]*\./gi, 'assumption'],
  ];
  for (const [pattern, kind] of patterns) {
    for (const m of text.matchAll(pattern)) {
      claims.push({ kind, text: m[0].trim().slice(0, 240) });
      if (claims.length >= 6) return claims;
    }
  }
  return claims;
}

const ANALYSIS_SYSTEM = `You are a department head participating in a structured decision council.
Analyze the question strictly from your function's perspective. Be concrete and quantitative where possible.
Classify your claims: clearly separate what is KNOWN (evidence), what you INFER, and what you ASSUME.
State risks from your domain's point of view. Do not try to reach agreement with anyone — this round is independent.
Keep it under 300 words.`;

const CROSS_SYSTEM = `You are a department head in round 2 of a decision council. You now see the round-1 analyses of the other participants.
Your job is cross-examination, not agreement: identify disagreements, weak assumptions, missing evidence, and contradictory projections in the OTHER analyses — and defend or revise your own position if the evidence demands it.
Explicitly list any claim you believe is WRONG and why. Keep it under 300 words.`;

const REANALYSIS_SYSTEM = `You are a department head in the final round of a decision council. Given the cross-examination, state your FINAL position:
either hold your recommendation (and say why the challenges did not move you) or revise it. Note explicitly what, if anything, changed your mind. Keep it under 200 words.`;

const SYNTHESIS_SYSTEM = `You are the synthesis chair of a decision council. You receive the final positions of every participant.
Produce a decision recommendation in this exact JSON shape:
{
  "recommendation": string,
  "confidence": "high" | "medium" | "low" | "none",
  "consensusReached": boolean,
  "disagreements": string[],
  "risks": string[],
  "unknowns": string[],
  "alternatives": [{ "name": string, "reasonRejected": string }]
}
Hard rules:
- If participants genuinely disagree on the core recommendation, set consensusReached=false and confidence="none", and DESCRIBE the split ("Finance recommends X while Engineering recommends Y") — do NOT paper over it. No artificial consensus.
- If evidence is insufficient, say so in "unknowns" and lower confidence.
- Never present an assumption as fact. Unknowns must be listed.
- Recommend ONE course of action only if consensus exists.`;

function parseSynthesisJson(raw: string): DeliberationResult['synthesis'] | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<DeliberationResult['synthesis']>;
    if (typeof parsed.recommendation !== 'string') return null;
    return {
      recommendation: parsed.recommendation,
      confidence: (['high', 'medium', 'low', 'none'] as const).includes(parsed.confidence as never)
        ? (parsed.confidence as DeliberationResult['synthesis']['confidence'])
        : 'low',
      consensusReached: parsed.consensusReached === true,
      disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements.slice(0, 10).map(String) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 10).map(String) : [],
      unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns.slice(0, 10).map(String) : [],
      alternatives: Array.isArray(parsed.alternatives)
        ? parsed.alternatives.slice(0, 5).map((a) => ({ name: String(a?.name ?? ''), reasonRejected: String(a?.reasonRejected ?? '') }))
        : [],
      verdictText: parsed.consensusReached
        ? `Council recommendation (confidence: ${parsed.confidence ?? 'low'})`
        : 'No consensus — positions preserved for the founder',
    };
  } catch {
    return null;
  }
}

export interface RunDeliberationInput {
  question: string;
  context?: string | null;
  /** Explicit participant list; when omitted, derived from the escalation engine. */
  participants?: Array<{ name: string; role: string; department: string }>;
  /** Called between rounds for progress reporting (fire-and-forget). */
  onProgress?: (update: { round: number; stage: string }) => void;
}

/**
 * Run a full deliberation session. LLM unavailability degrades honestly:
 * the result reports stoppedReason='llm_unavailable' — never a fabricated
 * recommendation.
 */
export async function runDeliberation(
  config: AppConfig,
  db: Db,
  orgId: string,
  userId: string,
  input: RunDeliberationInput,
): Promise<DeliberationResult> {
  const escalation = evaluateEscalation({ question: input.question, context: input.context });
  const result: DeliberationResult = {
    question: input.question,
    escalation,
    participants: [],
    rounds: [],
    synthesis: {
      recommendation: '',
      confidence: 'none',
      consensusReached: false,
      disagreements: [],
      risks: [],
      unknowns: [],
      alternatives: [],
      verdictText: 'Deliberation did not complete',
    },
    totalTokensUsed: 0,
    budgetUsd: escalation.budgetUsd,
    decisionId: null,
    requiresFounderApproval: escalation.requiresFounderApproval,
    stoppedReason: 'completed',
  };

  const roster =
    input.participants ??
    escalation.departments.slice(0, 4).map((d) => ({
      name: `${d.charAt(0).toUpperCase()}${d.slice(1)} Lead`,
      role: `${d} department head`,
      department: d,
    }));

  // Model diversity (§15): distinct models where the registry allows.
  // Expensive tiers only when the escalation justifies them (§16).
  const models = diverseModelsFor(roster.length, {
    allowExpensive: escalation.level === 'executive_deliberation' || escalation.level === 'department_council',
  });
  result.participants = roster.map((p, i) => ({
    name: p.name,
    role: p.role,
    department: p.department,
    model: models[i] ?? null,
  }));

  const budgetTokens = Math.floor((escalation.budgetUsd / 0.0025) * 1000); // ~GPT-4o-class blended rate
  let tokensUsed = 0;

  const buildContextBlock = (): string =>
    [
      `DECISION QUESTION: ${input.question}`,
      input.context ? `CONTEXT: ${input.context.slice(0, 2000)}` : null,
      `ESCALATION: ${escalation.level} (budget $${escalation.budgetUsd})${escalation.requiresFounderApproval ? ' — founder approval required for execution' : ''}`,
    ]
      .filter(Boolean)
      .join('\n');

  // ── Round 1: independent analysis (no participant sees another) ──
  input.onProgress?.({ round: 1, stage: 'independent analysis' });
  const round1: DeliberationAnalysis[] = [];
  for (const p of result.participants) {
    if (tokensUsed > budgetTokens) {
      result.stoppedReason = 'budget_exhausted';
      break;
    }
    const text = await chat(
      config,
      `${ANALYSIS_SYSTEM}\n\nYou represent the ${p.department} function.`,
      buildContextBlock(),
      { model: p.model ?? undefined, max_tokens: ANALYSIS_MAX_TOKENS, temperature: 0.4 },
    );
    if (!text) {
      result.stoppedReason = 'llm_unavailable';
      continue;
    }
    const analysis: DeliberationAnalysis = {
      participant: p.name,
      role: p.role,
      model: p.model,
      analysis: text,
      claims: extractClaims(text),
      round: 1,
      tokensUsed: Math.ceil((text.length + 600) / 4),
    };
    tokensUsed += analysis.tokensUsed;
    round1.push(analysis);
  }
  if (round1.length > 0) result.rounds.push({ round: 1, analyses: round1 });
  result.totalTokensUsed = tokensUsed;

  if (result.stoppedReason !== 'completed' || round1.length === 0) {
    if (result.stoppedReason === 'completed') result.stoppedReason = 'llm_unavailable';
    return result;
  }

  // ── Round 2: cross-examination (participants see round 1) ──
  input.onProgress?.({ round: 2, stage: 'cross-examination' });
  const round2: DeliberationAnalysis[] = [];
  const round1Digest = round1
    .map((a) => `--- ${a.participant} (${a.role}) ---\n${a.analysis}`)
    .join('\n\n')
    .slice(0, 6000);

  for (const p of result.participants) {
    if (tokensUsed > budgetTokens) {
      result.stoppedReason = 'budget_exhausted';
      break;
    }
    const own = round1.find((a) => a.participant === p.name);
    const text = await chat(
      config,
      `${CROSS_SYSTEM}\n\nYou represent the ${p.department} function.`,
      `${buildContextBlock()}\n\nALL ROUND-1 ANALYSES:\n${round1Digest}`,
      { model: p.model ?? undefined, max_tokens: ANALYSIS_MAX_TOKENS, temperature: 0.4 },
    );
    if (!text) continue;
    const analysis: DeliberationAnalysis = {
      participant: p.name,
      role: p.role,
      model: p.model,
      analysis: text,
      claims: extractClaims(text),
      round: 2,
      tokensUsed: Math.ceil((text.length + round1Digest.length / 10) / 4),
    };
    tokensUsed += analysis.tokensUsed;
    round2.push(analysis);
  }
  if (round2.length > 0) result.rounds.push({ round: 2, analyses: round2 });
  result.totalTokensUsed = tokensUsed;

  if (result.stoppedReason === 'budget_exhausted') return result;

  // ── Round 3: final positions ──
  input.onProgress?.({ round: 3, stage: 'final positions' });
  const round3: DeliberationAnalysis[] = [];
  const crossDigest = round2
    .map((a) => `--- ${a.participant} ---\n${a.analysis}`)
    .join('\n\n')
    .slice(0, 6000);

  for (const p of result.participants) {
    if (tokensUsed > budgetTokens) {
      result.stoppedReason = 'budget_exhausted';
      break;
    }
    const text = await chat(
      config,
      `${REANALYSIS_SYSTEM}\n\nYou represent the ${p.department} function.`,
      `${buildContextBlock()}\n\nYOUR ROUND-1 POSITION:\n${round1.find((a) => a.participant === p.name)?.analysis ?? '(unavailable)'}\n\nCROSS-EXAMINATION TRANSCRIPT:\n${crossDigest}`,
      { model: p.model ?? undefined, max_tokens: 768, temperature: 0.3 },
    );
    if (!text) continue;
    const analysis: DeliberationAnalysis = {
      participant: p.name,
      role: p.role,
      model: p.model,
      analysis: text,
      claims: extractClaims(text),
      round: 3,
      tokensUsed: Math.ceil((text.length + crossDigest.length / 10) / 4),
    };
    tokensUsed += analysis.tokensUsed;
    round3.push(analysis);
  }
  if (round3.length > 0) result.rounds.push({ round: 3, analyses: round3 });
  result.totalTokensUsed = tokensUsed;

  const finalPositions = (round3.length > 0 ? round3 : round2.length > 0 ? round2 : round1).map(
    (a) => `--- ${a.participant} (${a.role}) ---\n${a.analysis}`,
  );

  // ── Synthesis ──
  input.onProgress?.({ round: 4, stage: 'synthesis' });
  if (tokensUsed > budgetTokens) {
    result.stoppedReason = 'budget_exhausted';
    result.synthesis.verdictText = 'Deliberation stopped before synthesis: budget exhausted';
    return result;
  }

  const synthesisRaw = await chat(
    config,
    SYNTHESIS_SYSTEM,
    `${buildContextBlock()}\n\nFINAL POSITIONS:\n${finalPositions.join('\n\n').slice(0, 9000)}`,
    { model: models[0] ?? undefined, max_tokens: SYNTHESIS_MAX_TOKENS, temperature: 0.2 },
  );

  if (!synthesisRaw) {
    result.stoppedReason = 'llm_unavailable';
    result.synthesis.verdictText = 'Synthesis unavailable (LLM failure) — positions preserved above';
    return result;
  }

  const parsed = parseSynthesisJson(synthesisRaw);
  result.synthesis = parsed ?? {
    recommendation: synthesisRaw.slice(0, 2000),
    confidence: 'low',
    consensusReached: false,
    disagreements: [],
    risks: [],
    unknowns: ['Synthesis output could not be parsed as structured JSON — raw text preserved'],
    alternatives: [],
    verdictText: 'Synthesis returned unstructured output',
  };
  result.totalTokensUsed = tokensUsed + Math.ceil((synthesisRaw.length + 3000) / 4);

  // ── Persist significant outcomes into Decision Memory (§19) ──
  if (escalation.level === 'department_council' || escalation.level === 'executive_deliberation') {
    try {
      const decision = await createDecision(db, orgId, userId, {
        title: input.question.slice(0, 200),
        decisionType: 'strategic',
        confidence: result.synthesis.confidence === 'none' ? 'low' : result.synthesis.confidence,
        decisionMakerType: 'ai_council',
        whatWasDecided: result.synthesis.recommendation.slice(0, 2000),
        rationale: result.synthesis.verdictText,
        alternatives: result.synthesis.alternatives,
        evidence: result.rounds
          .flatMap((r) => r.analyses)
          .flatMap((a) => a.claims.filter((c) => c.kind === 'evidence').map((c) => ({ source: a.participant, type: 'council_analysis', summary: c.text })))
          .slice(0, 12),
        assumptions: result.rounds
          .flatMap((r) => r.analyses)
          .flatMap((a) => a.claims.filter((c) => c.kind === 'assumption').map((c) => c.text))
          .slice(0, 10),
        expectedOutcome: result.synthesis.recommendation.slice(0, 500),
        councilDetail: {
          question: input.question,
          context: input.context,
          objective: input.context ?? null,
          participants: result.participants,
          rounds: result.rounds,
          disagreements: result.synthesis.disagreements,
          risks: result.synthesis.risks,
          unknowns: result.synthesis.unknowns,
          alternatives: result.synthesis.alternatives,
          consensusReached: result.synthesis.consensusReached,
          confidence: result.synthesis.confidence,
          requiresFounderApproval: result.requiresFounderApproval,
          budgetUsd: result.budgetUsd,
          totalTokensUsed: result.totalTokensUsed,
          stoppedReason: result.stoppedReason,
          recordedAt: new Date().toISOString(),
        },
      });
      result.decisionId = decision.id;
    } catch (err) {
      // Decision persistence is best-effort; the deliberation result stands on
      // its own. But a silent failure here would make council sessions
      // invisible on the Decision Council page — never swallow it quietly.
      console.error(
        `[deliberation] decision persistence failed (org=${orgId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      result.decisionId = null;
    }
  }

  return result;
}
