import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Decision Center" };

export default function ApprovalsPage() {
  return (
    <ComingSoon
      title="Decision Center"
      phase="Phase 3–5"
      description="Every agent action that needs your sign-off, gathered in one queue with the context attached: what, why, what it costs, and what happens if you say no."
      contains={[
        "Approval requests with full context and cost preview",
        "Approve, modify, or reject with one click",
        "Delegation rules so routine approvals route to authorized executives",
        "A complete record of every decision you make",
      ]}
    />
  );
}
