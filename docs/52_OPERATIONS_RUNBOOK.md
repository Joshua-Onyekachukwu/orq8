# 52 — Operations Runbook

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 52.1 Daily

- Health endpoints (`/healthz`, `/readyz`); check queue depth (pg-boss), stuck workflows.
- Review: blocked tasks, need-human items, Decision Center backlog age (18.7).
- Budget warnings surfaced (24.4).

## 52.2 Weekly

- Cost review (24.2): AI spend, by dept/model/project, anomalies.
- Workforce health (12.5), agent performance flags (11).
- Weekly report (40.2) delivered; check delivery.

## 52.3 Incident Response (free-first)

1. **Contain:** emergency controls — pause org/dept/agent, revoke financial execution, stop outbound comms, freeze deploys (18.5). These work at the platform layer.
2. **Assess:** logs (pino), traces (39), audit trail (20) — what happened, who, which policy.
3. **Fix:** configuration change (versioned) or rollback (43.5).
4. **Verify:** golden workflow smoke test; audit chain check.
5. **Learn:** postmortem → memory lesson (21) → runbook update.

## 52.4 Common Incidents

| Incident | First action | Fix |
|----------|--------------|-----|
| Model provider outage | Router fallback (22.7) | none if fallback works; else pause affected dept |
| Agent stuck in loop | Operational limits trip (83) | review limits/config; restrict agent |
| Workflow stuck | Inspect workflow_runs/steps | resume step or need-human (15.4) |
| Integration auth expired | Alert → reconnect flow (25.2) | OAuth re-auth |
| Budget ceiling hit | Work blocked + approval queue | budget request flow (24.5) |
| DB bloat/queue backlog | Investigate; add index/partition (34.5) | maintenance window |
| Sandbox abuse | Kill container; revoke tool grant (30.5) | tighten allowlist |

## 52.5 On-Call (solo-founder reality)

Default on-call = the CEO. That's exactly why emergency controls, alerting (39.3), and the Decision Center exist — and why the product is designed to keep running while the human is away.

## 52.6 DR Link

Full restore procedures live in 53. Runbook pages are updated after every incident.
