# 40 — Reporting

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 40.1 Purpose (§37, §38)

Concise, executive-grade reporting closes the loop (Report → Learn). The **PA/Reporting Agent** prepares; the **Executive Agent reviews** before delivery (R-REP-3). A v1 weekly report ships with Golden Workflow v1 (Phase 6); full reporting is Phase 14.

## 40.2 Weekly CEO Report (§37)

executive summary · company goals · wins · problems · decisions made · pending CEO decisions · financial performance · AI spend · product · engineering · marketing · sales · customers · operations · risks · agent workforce health · major tool/vendor changes · next week's priorities

## 40.3 Monthly Executive Report (§38)

company performance · financials · AI workforce · AI/model cost · external software · infrastructure · goals/KPIs · projects · customer metrics · engineering/marketing/sales · risks · agent performance · organization changes · strategic recommendations

## 40.4 Generation Flow (durable workflow)

```
Schedule (weekly/monthly) → collect metrics (metric_snapshots, cost entries, goals, work, approvals)
  → PA agent drafts (template + data pack)
  → Executive Agent reviews (facts, gaps, tone)
  → deliver (Reports screen; SSE notify; email later)
  → archive; report.generated/reviewed/delivered events
```

## 40.5 Data Sources

MetricSnapshot (KPIs, health), CostEntry/ModelUsage (24), tasks/projects/goals (16), approvals/decisions (19), workforce health (12), audit counts, integration health (25).

## 40.6 Org Health (§88)

Health indicators with underlying evidence (never unexplained scores): goal · financial · workforce/agent · project · customer · technical · operational · risk · decision backlog · agent reliability · budget efficiency. Executive Agent summarizes in plain language (12.5).

## 40.7 UX

Reports screen (Reports nav, 33.2) with period selector, sections, drill-down to evidence, and "what needs my attention" summary. CEO home shows report-ready indicators.
