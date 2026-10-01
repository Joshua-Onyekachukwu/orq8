/**
 * Company health composite — the single source of truth for the number shown in
 * the dashboard stat strip and the HealthScore widget.
 *
 * This is a pure, framework-free module on purpose. It used to live inside
 * `components/dashboard/HealthScore.tsx`, which is a client component, so the
 * server-rendered dashboard threw "Attempted to call computeScore() from the
 * server but computeScore is on the client" and the whole page fell back to the
 * error boundary. Math has no business being client-only: the component now
 * imports from here too, so the two can never drift.
 */

export interface HealthScoreProps {
  activeAgents: number;
  totalAgents: number;
  completedTasks: number;
  totalTasks: number;
  creditsRemaining: number;
  creditsTotal: number;
  pendingApprovals: number;
  activeGoals: number;
  totalGoals: number;
}

export type HealthSegmentStatus = "good" | "warning" | "critical" | "neutral";

export interface HealthSegment {
  label: string;
  value: number;
  display: string;
  status: HealthSegmentStatus;
}

export interface ScoreResult {
  score: number;
  label: string;
  description: string;
  color: string;
  strokeColor: string;
  segments: HealthSegment[];
}

export function computeScore(props: HealthScoreProps): ScoreResult {
  const {
    activeAgents,
    totalAgents,
    completedTasks,
    totalTasks,
    creditsRemaining,
    creditsTotal,
    pendingApprovals,
    activeGoals,
    totalGoals,
  } = props;

  // Individual scores (0-100)
  const agentScore = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;
  const taskScore = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  const creditScore = creditsTotal > 0 ? (creditsRemaining / creditsTotal) * 100 : 0;
  const approvalScore = pendingApprovals === 0 ? 100 : Math.max(0, 100 - pendingApprovals * 20);
  const goalScore = totalGoals > 0 ? (activeGoals / totalGoals) * 100 : 0;

  // Weighted: agents 25%, tasks 30%, credits 20%, approvals 10%, goals 15%
  const raw =
    agentScore * 0.25 +
    taskScore * 0.3 +
    creditScore * 0.2 +
    approvalScore * 0.1 +
    goalScore * 0.15;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // Status. Health maps onto the status vocabulary: a healthy company is the
  // brand, a company needing a founder is the warm accent, a company in trouble
  // is the error tone. No fourth hue is invented for "pretty good".
  let label: string;
  let description: string;
  let color: string;
  let strokeColor: string;

  if (score >= 80) {
    label = "Thriving";
    description =
      "Your company is running smoothly. AI employees are productive and goals are on track.";
    color = "text-brand-deep";
    strokeColor = "var(--orq-brand-deep)";
  } else if (score >= 60) {
    label = "Healthy";
    description = "Good momentum. Some areas could use attention to reach full potential.";
    color = "text-brand-deep";
    strokeColor = "var(--orq-brand)";
  } else if (score >= 40) {
    label = "Needs Attention";
    description =
      "Several areas need founder input. Review pending approvals and stalled tasks.";
    color = "text-text-warm";
    strokeColor = "var(--orq-warm-deep)";
  } else {
    label = "At Risk";
    description = "Critical issues detected. Immediate action needed to get back on track.";
    color = "text-text-error";
    strokeColor = "var(--orq-error)";
  }

  const segStatus = (val: number): HealthSegmentStatus =>
    val >= 70
      ? "good"
      : val >= 40
        ? "warning"
        : totalAgents === 0 && val === 0
          ? "neutral"
          : "critical";

  return {
    score,
    label,
    description,
    color,
    strokeColor,
    segments: [
      {
        label: "Workforce",
        value: Math.round(agentScore),
        display: `${activeAgents}/${totalAgents}`,
        status: segStatus(agentScore),
      },
      {
        label: "Execution",
        value: Math.round(taskScore),
        display: `${completedTasks}/${totalTasks}`,
        status: segStatus(taskScore),
      },
      {
        label: "Credits",
        value: Math.round(creditScore),
        display: `${creditsRemaining}`,
        status: segStatus(creditScore),
      },
      {
        label: "Approvals",
        value: Math.round(approvalScore),
        display: pendingApprovals === 0 ? "Clear" : `${pendingApprovals} pending`,
        status: segStatus(approvalScore),
      },
      {
        label: "Goals",
        value: Math.round(goalScore),
        display: `${activeGoals} active`,
        status: segStatus(goalScore),
      },
    ],
  };
}
