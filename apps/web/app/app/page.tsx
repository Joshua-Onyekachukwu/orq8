import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DecisionCenter } from "@/components/dashboard/decision-center";
import { DeptBudgets } from "@/components/dashboard/dept-budgets";
import { RecentActions } from "@/components/dashboard/recent-actions";
import { StatCards } from "@/components/dashboard/stat-cards";
import { WelcomeBanner } from "@/components/dashboard/welcome";

export const metadata = { title: "Dashboard" };

// Dashboard composed from the Trezo template components (Dashboard/eCommerce):
// Welcome banner + stat cards on top, then a full-width activity chart,
// Decision Center table beside the budgets donut, and the agent-action list.
// All re-skinned with ORQ8 content and the navy/lime/emerald brand palette.
export default function AppPage() {
  return (
    <div className="trezo-main-content">
      <WelcomeBanner />

      <StatCards />

      <ActivityChart />

      <div className="lg:grid lg:grid-cols-3 gap-[25px]">
        <div className="lg:col-span-2">
          <DecisionCenter />
        </div>

        <div className="lg:col-span-1">
          <DeptBudgets />
        </div>
      </div>

      <RecentActions />
    </div>
  );
}
