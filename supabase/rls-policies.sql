-- ORQ8 Supabase RLS Policies
-- Run this in the Supabase SQL Editor
-- Fixed: tables created before functions, reserved words quoted

-- ============================================================
-- 1. Create helper tables FIRST (functions reference them)
-- ============================================================

-- User-Org Mapping Table (for RLS lookups)
CREATE TABLE IF NOT EXISTS public.user_org_mapping (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, org_id)
);

ALTER TABLE public.user_org_mapping ENABLE ROW LEVEL SECURITY;

-- Users can only see their own mapping
CREATE POLICY "users_own_mapping" ON public.user_org_mapping
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 2. Platform Admins Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Only admins can see admin list
CREATE POLICY "admins_only" ON public.platform_admins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Auth helper functions (after tables exist)
-- ============================================================

-- Function to get the current user's org_id from their JWT metadata
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT org_id FROM public.user_org_mapping WHERE user_id = auth.uid()),
    ''
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 4. Sync trigger — when a user signs up via Supabase Auth,
--    automatically create their org mapping if not exists
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_org_mapping (user_id, org_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'org_id', ''), 'owner')
  ON CONFLICT (user_id, org_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 5. Notes on ORQ8's main tables
-- ============================================================

-- ORQ8's main PostgreSQL tables (agents, approvals, tasks, goals, etc.)
-- are managed by Drizzle ORM and connected via direct PostgreSQL connection.
-- These tables already have org_id scoping via requireAuth() middleware.
--
-- Layer 1: ORQ8 server-side (requireAuth + orgId scoping)
-- Layer 2: This Supabase auth layer (for auth-related data)
--
-- This is sufficient for the MVP. Add deeper RLS when scaling.
