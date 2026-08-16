import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Audit Trail" };

export default function AuditPage() {
  return (
    <ComingSoon
      title="Audit Trail"
      phase="Phase 5"
      description="An immutable record of every action, decision, and spend in your company. Tamper-evident, exportable, and yours."
      contains={[
        "Every action, decision, and spend, immutably recorded",
        "Tamper-evident history you can verify",
        "Full export for accountants and regulators",
        "Search across the entire life of the organization",
      ]}
    />
  );
}
