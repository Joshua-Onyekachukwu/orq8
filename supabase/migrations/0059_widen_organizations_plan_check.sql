-- B4 live proof: the Stripe webhook writes billing plans (founder/team/company)
-- and 'trial' (on cancel) into organizations.plan, but the 0001 check only
-- allowed free/pro/business/enterprise — every real payment failed the
-- update and the webhook row went to status=failed. The drizzle schema
-- declares trial | founder | team | company | enterprise (+ legacy free, pro,
-- business kept so existing rows stay valid).
alter table organizations drop constraint if exists organizations_plan_check;
alter table organizations
  add constraint organizations_plan_check
  check (plan in ('free', 'trial', 'founder', 'team', 'pro', 'company', 'business', 'enterprise'));
