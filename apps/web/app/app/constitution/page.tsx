import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Company Constitution" };

export default function ConstitutionPage() {
  return (
    <ComingSoon
      title="Company Constitution"
      phase="Phase 5"
      description="The rules your company runs by: what agents may do on their own, what always needs you, and how money moves. Your sovereignty, written down and enforced."
      contains={[
        "Your founding rules, purpose, and non-negotiables",
        "What agents can decide alone versus what needs you",
        "Budget and approval policies with enforcement",
        "The full audit record of every rule ever set",
      ]}
    />
  );
}
