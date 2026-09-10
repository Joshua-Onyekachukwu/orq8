-- Migration 0028 — persist decision-review verdicts (§20 phase 2).
--
-- decision-feedback.ts files outcome reviews into Decision Memory but only
-- stored the narrative summary + lessons; the structured verdict
-- (accurate / partially_accurate / inaccurate) lived only in the audit
-- input_ref string. Persisting it as a column lets the performance-signal
-- layer (decision-signals.ts) aggregate prediction accuracy directly from
-- Decision Memory instead of re-deriving it from prose.
--
-- Idempotent: the column is added only when missing; the backfill runs only
-- against rows that have not been classified yet.

-- 1. Column (guarded for the multi-pass runner).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'decisions' and column_name = 'prediction_accuracy'
  ) then
    alter table decisions
      add column prediction_accuracy text
      check (prediction_accuracy in ('accurate', 'partially_accurate', 'inaccurate'));
  end if;
end
$$;

-- 2. Backfill from the audit trail the feedback loop already wrote.
--    appendAudit stored {"decisionId": "...", "accuracy": "..."} as input_ref
--    on decision.outcome_reviewed events. Only fill rows with no verdict yet
--    so re-runs never overwrite a newer classification.
update decisions d
set prediction_accuracy = (
  select substring(ae.input_ref from '"accuracy":"([a-z_]+)"')::text
  from audit_events ae
  where ae.org_id = d.org_id
    and ae.action = 'decision.outcome_reviewed'
    and ae.input_ref like '%"decisionId":"' || d.id::text || '"%'
  order by ae.occurred_at desc
  limit 1
)
where d.outcome_filed_at is not null
  and d.prediction_accuracy is null;

-- 3. New filings must carry a verdict — enforced at write time by
--    decision-feedback.ts; the column CHECK (added with the column above)
--    constrains the value set.
