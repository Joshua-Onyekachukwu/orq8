import { ComingSoon } from "../../../components/coming-soon";

export const metadata = { title: "Members & Roles" };

export default function MembersPage() {
  return (
    <ComingSoon
      title="Members & Roles"
      phase="Phase 2"
      description="Invite the humans in your company, assign roles and authority, and decide who can hire, approve, and see what."
      contains={[
        "Invite members by email",
        "Roles with clear authority levels",
        "Who can hire, approve, and view what",
        "Role-based access to every surface",
      ]}
    />
  );
}
