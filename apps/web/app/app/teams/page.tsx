import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Departments & Teams" };

export default function TeamsPage() {
  return (
    <ComingSoon
      title="Departments & Teams"
      phase="Phase 2"
      description="Organize agents into departments and teams, set each one's budget and authority, and let work flow where the business need lives."
      contains={[
        "Create departments, teams, and projects",
        "Assign agents with roles and responsibilities",
        "Per-department budgets and approval authority",
        "Agent hiring driven by real business needs",
      ]}
    />
  );
}
