-- 0058 — waitlist source: allow Product Hunt attribution.
--
-- WK7 (Product Hunt launch) needs `source = 'producthunt'` on
-- `waitlist_signups` so launch-week signups are attributable. The 0001
-- check constraint only allowed ('landing','design_partner','referral'),
-- which would 500 every PH signup at the DB layer even though the zod
-- contract (`waitlistBody.source`) accepts any short string.
--
-- Idempotent: drop by name if it exists, re-add with the widened set.

alter table public.waitlist_signups
  drop constraint if exists waitlist_signups_source_check;

alter table public.waitlist_signups
  drop constraint if exists waitlist_signups_source_check_ph;

alter table public.waitlist_signups
  add constraint waitlist_signups_source_check_ph
  check (source in ('landing', 'design_partner', 'referral', 'producthunt'));
