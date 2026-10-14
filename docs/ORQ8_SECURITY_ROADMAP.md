# ORQ8 Security Roadmap (living — updated end of every phase)

- [x] Phase 0: baseline, data flows, risk register (2026-10-12 — this set of docs)
- [x] R-001 fix: agent-governance gates + regression test (2026-10-12)
- [x] Phase 1.3: full role matrix (R-002) — 12 sites gated + regression test (2026-10-12)
- [ ] Phase 1 (rest): OWASP sweep — input security, auth re-test,
      frontend headers/CSP/bundle audit, dependency audit
- [x] Phase 2 (part): RLS re-run 59/59 (R-004→MITIGATED), full secret scan
      (R-006→PARTIAL) — 2026-10-12
- [x] R-006 closeout: CI gitleaks workflow + rotation procedure (2026-10-12)
- [x] Phase 7: security-signal scanner + cron + lockout audit; IR v1.1 (NDPA,
      decision log); DR rewrite for real arch; CodeQL SAST (R-009→PARTIAL,
      Phase 8 started) — 2026-10-12
- [ ] Phase 2 (rest): Vercel verification (R-005), RLS matrix extension
      (files/invitations/orgs), GitHub push-protection toggle (founder)
- [x] Phase 3.1: prompt-injection battery (R-003→PARTIAL) — strip + framing +
      echo-model e2e, 11/11 (2026-10-12)
- [ ] Phase 3 (rest): tool-registry audit, memory isolation tests, spend chaos
      tests (R-007), LLM red-teaming, EA path, doc-upload channel
- [ ] Phase 4: data inventory, controller/processor map, retention/deletion, rights workflow
- [ ] Phase 5: Nigeria NDPA + GDPR/UK-GDPR + US-state applicability matrix (counsel)
- [ ] Phase 6: privacy policy / ToS / DPA + policy-implementation matrix (drafts)
- [ ] Phase 7: monitoring alerts, incident playbook, isolated restore test (R-009)
- [ ] Phase 8: SAST/DAST/secret-scan in CI, adversarial suite, pentest scoping
- [ ] Phase 9: vendor/subprocessor assessments + contracts
- [ ] Phase 10: evidence repository assembly
- [ ] Phase 11: launch gates A–E + decision (current trajectory: NOT READY — R-002…R-009 open)

Changed files 2026-10-12 (role-matrix): `routes/{providers,integrations,mcp,events,
constitution,plan-revisions,company-builder,workforce,billing,workforce-roi}.ts`
(25 gates), `test/role-matrix-gates.integration.test.ts` (new, 4/4).
Changed files 2026-10-12 (injection): `services/task-tools.ts` (strip +
framing), `services/agent-context.ts` (strip + framing), `services/webhooks.ts`
(interpolation sanitize), `test/prompt-injection.test.ts` (new, 9/9),
`test/prompt-injection.integration.test.ts` (new, 2/2).

Changed files earlier session: `apps/api/src/routes/agents.ts` (5 role gates),
`apps/api/test/agent-governance-gate.integration.test.ts` (new), this doc set.
No product behavior changed except member governance denials (403 with explicit codes).
