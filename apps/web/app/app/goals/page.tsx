import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Goals & Tasks" };

export default function GoalsPage() {
  return (
    <ComingSoon
      title="Goals & Tasks"
      phase="Phase 4"
      description="Set the outcomes that matter, let the organization decompose them into tasks, and watch work flow to the right agents with the right context."
      contains={[
        "Company, department, and team goals",
        "Automatic task decomposition from goals",
        "Assignment, tracking, and status",
        "Tasks that trace back to the goal they serve",
      ]}
    />
  );
}
