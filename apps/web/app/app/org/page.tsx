import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Org Explorer" };

export default function OrgPage() {
  return (
    <ComingSoon
      title="Org Explorer"
      phase="Phase 2"
      description="Your whole company on one map: departments, teams, agents, projects, and who reports to whom. See the organization the way the system sees it."
      contains={[
        "Visual org chart with live agent status",
        "Departments, teams, and reporting lines",
        "Projects and which agents are assigned",
        "Click any node to see its full picture",
      ]}
    />
  );
}
