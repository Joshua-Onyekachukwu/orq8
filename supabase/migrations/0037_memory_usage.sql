-- Gap D (docs/66 §66.14) — make "this knowledge was actually used" a recorded fact.
--
-- Company memory existed, retrieval existed, and the API even returned a
-- useCount field — but nothing in the product ever recorded that a memory entry
-- had been put in front of an employee working on a task. The count was a
-- hardcoded 0 and "last used" was a hardcoded null, so after the founder taught
-- the company something there was no way to tell whether the next task ever saw
-- it. These two columns make each retrieval observable and inspectable later:
-- how many times the knowledge has been surfaced to an employee, and when it
-- last was.
--
-- Additive and defaulted, so existing rows read as "never used", which is the
-- truth about them.

alter table company_memory add column if not exists use_count integer not null default 0;
alter table company_memory add column if not exists last_used_at timestamptz;
