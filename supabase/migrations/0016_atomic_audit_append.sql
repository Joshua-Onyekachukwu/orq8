-- Enable pgcrypto for sha256() and encode() used in the hash computation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 0016: Atomic per-organization audit chain append
--
-- The previous appendAudit (read last hash → compute → insert) had a TOCTOU
-- race: two concurrent transactions for the SAME organization could both read
-- the same prev_hash, producing a fork.
--
-- Fix: a database function that serializes per-org via pg_advisory_xact_lock,
-- making concurrent appends for the same org execute sequentially while
-- different orgs remain fully parallel.

CREATE OR REPLACE FUNCTION public.append_audit_event(
  p_org_id        uuid,
  p_actor_type    text,
  p_actor_id      uuid,
  p_department_id uuid,
  p_agent_id      uuid,
  p_task_id       uuid,
  p_action        text,
  p_tool          text,
  p_input_ref     text,
  p_result_ref    text,
  p_authz         text,
  p_approval_id   uuid,
  p_policy_ref    text,
  p_cost          integer,
  p_outcome       text,
  p_occurred_at   timestamptz
) RETURNS TABLE (
  out_id       bigint,
  out_prev     text,
  out_hash     text
) AS $fn$
DECLARE
  v_prev_hash text;
  v_hash      text;
  v_actor     text;
  v_payload   text;
  v_genesis   text;
  v_last      record;
  v_iso_ts    text;
BEGIN
  -- Serialize per-organization. Two concurrent calls for the SAME org will
  -- queue; calls for DIFFERENT orgs run fully in parallel.
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(p_org_id::text, 1, 8))::bit(32)::integer
  );

  -- Find the latest audit event for this organization.
  SELECT ae.hash INTO v_last
  FROM public.audit_events ae
  WHERE ae.org_id = p_org_id
  ORDER BY ae.id DESC
  LIMIT 1;

  -- Genesis hash if no events exist yet.
  v_genesis := encode(
    sha256((p_org_id || ':' || 'orq8-genesis-v1')::bytea),
    'hex'
  );

  IF v_last IS NOT NULL THEN
    v_prev_hash := v_last.hash;
  ELSE
    v_prev_hash := v_genesis;
  END IF;

  -- Build the deterministic actor string (matches TypeScript: "type:id").
  v_actor := p_actor_type || ':' || COALESCE(p_actor_id::text, '');

  -- Build the deterministic payload as compact JSON (no spaces, matching
  -- TypeScript's JSON.stringify output exactly).
  -- Uses inline CASE expressions instead of nested functions for PG <14 compat.
  v_payload := '{'
    || '"department_id":' || CASE WHEN p_department_id IS NULL THEN 'null' ELSE '"' || p_department_id::text || '"' END || ','
    || '"agent_id":'      || CASE WHEN p_agent_id IS NULL      THEN 'null' ELSE '"' || p_agent_id::text      || '"' END || ','
    || '"task_id":'       || CASE WHEN p_task_id IS NULL       THEN 'null' ELSE '"' || p_task_id::text       || '"' END || ','
    || '"tool":'          || CASE WHEN p_tool IS NULL          THEN 'null' ELSE '"' || replace(replace(p_tool, E'\\', '\\\\'), '"', '\\"') || '"' END || ','
    || '"input_ref":'     || CASE WHEN p_input_ref IS NULL     THEN 'null' ELSE '"' || replace(replace(p_input_ref, E'\\', '\\\\'), '"', '\\"') || '"' END || ','
    || '"result_ref":'    || CASE WHEN p_result_ref IS NULL    THEN 'null' ELSE '"' || replace(replace(p_result_ref, E'\\', '\\\\'), '"', '\\"') || '"' END || ','
    || '"authorization":' || CASE WHEN p_authz IS NULL         THEN 'null' ELSE '"' || replace(replace(p_authz, E'\\', '\\\\'), '"', '\\"') || '"' END || ','
    || '"approval_id":'   || CASE WHEN p_approval_id IS NULL   THEN 'null' ELSE '"' || p_approval_id::text   || '"' END || ','
    || '"policy_ref":'    || CASE WHEN p_policy_ref IS NULL    THEN 'null' ELSE '"' || replace(replace(p_policy_ref, E'\\', '\\\\'), '"', '\\"') || '"' END || ','
    || '"cost":'          || CASE WHEN p_cost IS NULL          THEN 'null' ELSE p_cost::text END || ','
    || '"outcome":'       || '"' || p_outcome || '"'
    || '}';

  -- Format timestamp as ISO 8601 matching JavaScript Date.toISOString():
  -- "2026-09-08T12:34:56.789Z" (UTC, T separator, 3 decimal places, Z suffix).
  v_iso_ts := to_char(
    p_occurred_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  -- Compute the chain hash (matches TypeScript computeAuditHash):
  -- sha256(prevHash || "||" || orgId || "||" || actor || "||" || action
  --        || "||" || payload || "||" || occurredAt)
  v_hash := encode(
    sha256(
      (v_prev_hash || '||' || p_org_id::text || '||' || v_actor
       || '||' || p_action || '||' || v_payload
       || '||' || v_iso_ts)::bytea
    ),
    'hex'
  );

  -- Insert the new audit event atomically (inside the advisory lock).
  INSERT INTO public.audit_events (
    org_id, actor_type, actor_id, department_id, agent_id, task_id,
    action, tool, input_ref, result_ref, "authorization", approval_id,
    policy_ref, cost, outcome, occurred_at, prev_hash, hash
  ) VALUES (
    p_org_id, p_actor_type, p_actor_id, p_department_id, p_agent_id, p_task_id,
    p_action, p_tool, p_input_ref, p_result_ref, p_authz, p_approval_id,
    p_policy_ref, p_cost, p_outcome, p_occurred_at, v_prev_hash, v_hash
  );

  -- Return the inserted row's id and hashes.
  out_id   := currval(pg_get_serial_sequence('public.audit_events', 'id'));
  out_prev := v_prev_hash;
  out_hash := v_hash;

  RETURN NEXT;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow the application role to call the function.
GRANT EXECUTE ON FUNCTION public.append_audit_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_audit_event TO anon;
