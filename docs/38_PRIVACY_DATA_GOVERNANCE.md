# 38 — Privacy & Data Governance

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 38.1 Data Classification

Public / Internal / Confidential / Restricted. Every memory entry, document, and integration data source carries a class; retrieval enforces it (21.7). Constitution data rules (17a IX) are compiled into permission checks.

## 38.2 Consent & Use

- **No personal data is used for model training** without explicit consent (17a IX.3).
- Customer data handling follows applicable law (GDPR/CCPA foundations); orgs configure jurisdiction-specific policies via governance (18).

## 38.3 Retention & Purge

- Retention policies per data category (org-configurable); purge workflows with approval (destructive action — CEO tier).
- Audit trail retained per policy (append-only, exportable); export supports compliance + data-subject requests.

## 38.4 Data Subject & Export

- Org data export (documents, memory, decisions, tasks) for portability.
- User/org deletion workflow: staging (pause) → export → purge → confirm (emergency controls + approvals).
- Vendor DPAs: platform maintains a standard DPA; BYOK providers are the user's relationship (documented in Settings).

## 38.5 Secret Hygiene (reaffirmed)

Secrets only in SecretStore (23.5); never in memory, logs, prompts, or model context (21.8). Redaction pipeline on logs and memory writes.

## 38.6 Security Ties

Access to Confidential/Restricted data is audited (`access_events`, 20). Cross-tenant isolation enforced (37.4) and tested (44). Phase 16 hardening: RLS, retention automation, DSR tooling, region pinning if required.
