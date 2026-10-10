/**
 * Per-department health (docs/85 §6 P3).
 *
 * A department is judged on the four things the product actually knows about it:
 * how much of its workforce is active, how its work resolved in the window,
 * whether its budget is intact, and how many of its requests are sitting on the
 * founder. The company composite's fifth dimension — goals — is deliberately
 * excluded: goals are org-scoped and carry no department column, so including
 * them would mean scoring a department on a number that is not its own.
 *
 * The weights are the company weights (agents 25%, tasks 30%, credits 20%,
 * approvals 10%) renormalised over the dimensions that apply. When a department
 * has no budget set, the credits dimension is dropped and the rest is
 * renormalised again, rather than scoring it zero for an unset ceiling.
 *
 * Both the executive strip and the department page call this, so the same
 * department cannot show two different health scores.
 */
export interface DepartmentHealthInput {
  membersActive: number;
  membersTotal: number;
  tasksDone: number;
  tasksFailed: number;
  tasksWorking: number;
  tasksQueued: number;
  gatesPending: number;
  /** Null when the department has no budget; the dimension is then not scored. */
  budgetAmount: number | null;
  budgetRemaining: number | null;
}

export interface DepartmentHealthResult {
  score: number;
  label: string;
  segments: HealthSegment[];
}

function departmentLabel(score: number): string {
  if (score >= 80) return "Thriving";
  if (score >= 60) return "Healthy";
  if (score >= 40) return "Needs Attention";
  return "At Risk";
}

export function departmentHealth(input: DepartmentHealthInput): DepartmentHealthResult {
  const {
    membersActive,
    membersTotal,
    tasksDone,
    tasksFailed,
    tasksWorking,
    tasksQueued,
    gatesPending,
    budgetAmount,
    budgetRemaining,
  } = input;

  const tasksTotal = tasksDone + tasksFailed + tasksWorking + tasksQueued;
  const workforce = membersTotal > 0 ? (membersActive / membersTotal) * 100 : 0;
  const execution = tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0;
  const approvals = gatesPending === 0 ? 100 : Math.max(0, 100 - gatesPending * 20);

  const segments: HealthSegment[] = [
    {
      label: "Workforce",
      value: Math.round(workforce),
      display: `${membersActive}/${membersTotal}`,
      status: segmentStatus(workforce, membersTotal === 0),
    },
    {
      label: "Execution",
      value: Math.round(execution),
      display: `${tasksDone}/${tasksTotal}`,
      status: segmentStatus(execution, tasksTotal === 0),
    },
    {
      label: "Approvals",
      value: Math.round(approvals),
      display: gatesPending === 0 ? "Clear" : `${gatesPending} pending`,
      status: segmentStatus(approvals, false),
    },
  ];

  // Weighted over the dimensions present in this department's data.
  let weighted = workforce * 0.25 + execution * 0.3 + approvals * 0.1;
  let weightSum = 0.65;

  const hasBudget = budgetAmount !== null && budgetAmount > 0 && budgetRemaining !== null;
  if (hasBudget) {
    const credits = Math.max(0, Math.min(100, (budgetRemaining! / budgetAmount!) * 100));
    segments.push({
      label: "Budget",
      value: Math.round(credits),
      display: `${buildBudgetDisplay(budgetRemaining!, budgetAmount!)}`,
      status: segmentStatus(credits, false),
    });
    weighted += credits * 0.2;
    weightSum += 0.2;
  }

  const score = Math.max(0, Math.min(100, Math.round(weighted / weightSum)));
  return { score, label: departmentLabel(score), segments };
}

/** "12 / 40" credits, without a currency sign — credits are the unit, not money. */
function buildBudgetDisplay(remaining: number, total: number): string {
  return `${Math.round(remaining)}/${Math.round(total)}`;
}

function segmentStatus(value: number, neutral: boolean): HealthSegmentStatus {
  if (neutral && value === 0) return "neutral";
  if (value >= 70) return "good";
  return value >= 40 ? "warning" : "critical";
}

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
