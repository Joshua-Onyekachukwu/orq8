import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Budgets & Limits" };

export default function BudgetsPage() {
  return (
    <ComingSoon
      title="Budgets & Limits"
      phase="Phase 2"
      description="Decide what the company may spend, where, and on what. Every agent action carries a cost, and every cost checks against the limits you set."
      contains={[
        "Weekly and monthly budgets per department",
        "Per-agent and per-action spend limits",
        "Hard caps that pause work before overspend",
        "Cost visibility on every single action",
      ]}
    />
  );
}
