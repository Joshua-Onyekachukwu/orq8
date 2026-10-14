# ORQ8 Incident Response Plan

**Version:** 1.0
**Effective Date:** September 8, 2026
**Review Cycle:** Quarterly

---

## 1. Purpose

This document defines ORQ8's procedures for detecting, responding to, and recovering from security incidents, data breaches, and service disruptions. It ensures compliance with GDPR (72-hour notification requirement) and provides a structured approach to incident management.

---

## 2. Incident Classification

| Severity | Description | Response Time | Escalation |
|----------|-------------|---------------|------------|
| **P0 — Critical** | Data breach, service completely down, unauthorized access to production data | Immediate | Founder + DPO |
| **P1 — High** | Partial service disruption, potential data exposure, failed security controls | Within 1 hour | Founder |
| **P2 — Medium** | Degraded performance, non-critical feature failure, suspicious activity | Within 4 hours | Founder |
| **P3 — Low** | Minor bugs, cosmetic issues, low-risk vulnerabilities | Within 24 hours | Normal workflow |

---

## 3. Incident Response Phases

### Phase 1: Detection & Identification

**Sources:**
- Automated monitoring (health checks, error tracking)
- User reports
- Security scans
- Audit log anomalies
- Infrastructure provider alerts (Railway, Supabase, Vercel)

**Initial Assessment:**
- What happened?
- When did it happen?
- What systems are affected?
- Is data at risk?
- Who is affected?

### Phase 2: Containment

**Immediate containment:**
- Isolate affected systems if necessary
- Revoke compromised credentials immediately
- Block malicious access
- Enable additional logging

**Short-term containment:**
- Apply patches or workarounds
- Redirect traffic if needed
- Preserve evidence (logs, snapshots, audit trails)

### Phase 3: Eradication

- Identify root cause
- Remove malicious code or access
- Patch vulnerabilities
- Rotate all potentially compromised credentials
- Verify system integrity

### Phase 4: Recovery

- Restore from clean backups if necessary
- Verify system functionality
- Monitor for recurrence
- Gradually restore full service
- Confirm data integrity

### Phase 5: Notification

**Nigeria NDPA (primary context):** a qualifying personal-data breach must be
notified to the NDPC within 72 hours of becoming aware, where the conditions
in the Act and implementation directive are met; keep the acknowledgment on
record. **GDPR/UK GDPR (where in scope):** supervisory-authority notification
within 72 hours where applicable, plus direct notice to affected individuals
without undue delay where there is high risk. Triggers, thresholds, and
filing routes differ by regime — confirm with qualified counsel per incident;
never auto-send legal notifications. Record every notification decision (and
decision NOT to notify, with reasons) in the breach decision log (§9).

**Notification contacts:**
- NDPC: [founder to file: portal + case ID here]
- EU/UK DPA (if in scope): [TBD by counsel]
- Users: Email + in-app notification
- Internal: Founder + team

### Phase 6: Post-Incident Review

Within 7 days of incident resolution:
- Complete incident timeline
- Root cause analysis
- Lessons learned
- Action items for prevention
- Update this plan if needed

---

## 4. Data Breach Response

### What Constitutes a Data Breach

- Unauthorized access to user data
- Accidental disclosure of personal data
- Loss or theft of data
- Ransomware affecting user data
- Any breach of tenant isolation (RLS bypass)

### Breach Assessment Checklist

- [ ] Type of personal data involved
- [ ] Volume of data affected
- [ ] Number of individuals affected
- [ ] Whether data was encrypted
- [ ] Whether data was exfiltrated
- [ ] Risk to affected individuals
- [ ] Whether containment was successful

### Notification Requirements

| Scenario | Who to Notify | When |
|----------|---------------|------|
| Qualifying personal-data breach (NDPA) | NDPC | Within 72 hours of awareness (confirm trigger with counsel) |
| Personal data breach (GDPR, where in scope) | Supervisory authority | Within 72 hours |
| High-risk personal data breach | Affected users | Without undue delay |
| Tenant isolation breach | Affected organizations | Within 24 hours |
| Service outage | All users (status page) | Immediately |
| Security vulnerability (internal) | Founder | Immediately |

---

## 5. Specific Response Procedures

### 5.1 Database Compromise

1. Immediately verify RLS policies are intact
2. Check for unauthorized queries in audit logs
3. Verify tenant isolation has not been breached
4. Rotate database credentials
5. Notify affected organizations if data was accessed
6. Restore from verified backup if data integrity is uncertain

### 5.2 API Key Exposure

1. Identify which keys are exposed
2. Rotate all exposed keys immediately
3. Check for unauthorized usage of exposed keys
4. Update all services using the keys
5. Review how the exposure occurred
6. Implement additional safeguards

### 5.3 AI Model Compromise

1. Disable AI model access if manipulation is suspected
2. Review recent EA tool executions for anomalies
3. Check for prompt injection attempts in audit logs
4. Verify governance controls were not bypassed
5. Restore from last known good configuration

### 5.4 Infrastructure Compromise

1. Contact infrastructure provider (Railway, Supabase, Vercel)
2. Verify application integrity
3. Check for unauthorized deployments
4. Rotate all service credentials
5. Review access logs

---

## 6. Evidence Preservation

During any incident:
- Do not delete logs
- Do not overwrite audit trails
- Take snapshots of affected systems
- Preserve database state where possible
- Document all actions taken with timestamps

---

## 7. Escalation Matrix

| Role | Contact | When to Escalate |
|------|---------|------------------|
| Founder/CEO | [FOUNDER: name + phone + backup channel] | All P0/P1 incidents |
| DPO / DPCO | [FOUNDER: name or `dpo@orq8.com` owner + engagement letter ref] | Data breaches |
| Legal (Nigeria) | [FOUNDER: counsel name + retainer ref; required before notifications] | Breach notifications, regulatory inquiries |
| Infrastructure | Vercel support (web/API) | Hosting/deployment incidents |
| Database | Supabase support | Database-level incidents |
| Object storage | S3-compatible provider support | File-storage incidents |

> Bracketed contacts are founder-owned setup items: this plan is DRAFT until
> they are filled. Railway was removed from the escalation path 2026-10-12
> (legacy infra; Vercel + Supabase are production).

---

## 8. Documentation Requirements

Every incident must produce:
- Incident report (within 7 days)
- Timeline of events
- Root cause analysis
- Remediation actions
- Preventive measures
- Notification records (if applicable)

---

## 9. Breach Decision Log (template — copy per incident)

| Field | Entry |
|-------|-------|
| Incident ID / date opened | |
| Severity (P0–P3) | |
| Systems + data categories affected | |
| Cross-tenant exposure? (orgs affected) | |
| Containment time | |
| NDPA trigger met? (counsel ref) | |
| NDPC notified? (date, case ID) | |
| GDPR/UK GDPR trigger met? (counsel ref) | |
| Authority notified? (date, ref) | |
| Individuals notified? (date, channel) | |
| Decision NOT to notify (reasons) | |
| Credentials rotated (per rotation log) | |
| Report filed (≤7 days) | |

Do not send legal notifications automatically: every row above needs human
assessment and (for notifications) counsel confirmation first.

---

## 10. Testing & Drills

- Review this plan quarterly
- Conduct tabletop exercises semi-annually
- Verify monitoring and alerting monthly
- Test backup restoration quarterly

---

## 10. Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | September 8, 2026 | Initial version |
| 1.1 | October 12, 2026 | NDPA notification track, decision log, real escalation path (Vercel/Supabase/S3; Railway removed), rotation-procedure link, contact placeholders flagged founder-owned |

**Owner:** Founder/CEO
**Review Cycle:** Quarterly
