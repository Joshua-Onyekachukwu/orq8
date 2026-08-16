import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Weekly Report" };

export default function ReportPage() {
  return (
    <ComingSoon
      title="Weekly Report"
      phase="Phase 3"
      description="The week in one page, every Monday. What happened, what's blocked, what it cost, and what's next. Five minutes to read, written for you by the Executive Agent."
      contains={[
        "A plain-language summary of everything the company did",
        "Blockers and decisions that need you",
        "Spend versus budget, department by department",
        "Recommended next week's priorities",
      ]}
    />
  );
}
