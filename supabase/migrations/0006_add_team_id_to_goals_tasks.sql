-- ORQ8 — Production migration: optional team_id on goals and tasks.
-- Run in Supabase SQL Editor BEFORE deploying new API code.
-- Safe to run multiple times (guarded ADD COLUMN).
--
-- ON DELETE SET NULL: archiving/deleting a team nulls the reference instead of
-- orphaning or cascading away goals/tasks — their org-level records survive.

-- ============================================================
-- 1. goals.team_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goals' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE public.goals
      ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
    CREATE INDEX goals_team_idx ON public.goals(team_id);
  END IF;
END $$;

-- ============================================================
-- 2. tasks.team_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE public.tasks
      ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
    CREATE INDEX tasks_team_idx ON public.tasks(team_id);
  END IF;
END $$;

-- ============================================================
-- 3. Verification
-- ============================================================
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name = 'goals' OR table_name = 'tasks')
  AND column_name = 'team_id'
ORDER BY table_name;