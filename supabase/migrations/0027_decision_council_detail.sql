-- 0027: Decision Council session persistence (§11, §47).
--
-- The deliberation engine already persists the synthesis (recommendation,
-- confidence, evidence, assumptions, expected outcome) into `decisions`.
-- This column stores the FULL structured session — participants and their
-- models, every round with verbatim analyses and claim labels, disagreements,
-- risks, unknowns, alternatives, budget and stop reason — so the Decision
-- Council UI can show who analyzed what, with which models, and let a founder
-- inspect the reasoning in detail (§47) without dumping transcripts by default.

ALTER TABLE public.decisions ADD COLUMN IF NOT EXISTS council_detail jsonb;
