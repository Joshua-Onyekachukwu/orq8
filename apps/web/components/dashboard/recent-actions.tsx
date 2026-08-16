import { ArrowUpRight, Bot, FileText, GitPullRequest, Search } from "lucide-react";

// Ported from the Trezo template (Dashboard/eCommerce/RecentTransaction.tsx):
// icon-chip list rows with title + subtitle and a right-aligned value.
// Re-skinned for ORQ8 agent actions, keeping the inline "because" line.
const actions = [
  {
    time: "09:41",
    agent: "Researcher · α",
    summary: "Read 42 competitor pricing pages and updated the market map",
    because: "Marketing needs pricing intel for the launch post",
    cost: "$0.42",
    icon: Search,
    tone: "bg-secondary-50 text-secondary-500",
  },
  {
    time: "09:12",
    agent: "Writer · α",
    summary: "Drafted Launch post v2 and sent it for approval",
    because: "The LinkedIn campaign needs a first draft",
    cost: "$0.18",
    icon: FileText,
    tone: "bg-purple-50 text-purple-600",
  },
  {
    time: "08:47",
    agent: "Engineer · α",
    summary: "Opened PR #142 and marked it ready for review",
    because: "The deployment pipeline change is verified",
    cost: "$0.09",
    icon: GitPullRequest,
    tone: "bg-emerald/10 text-emerald-700",
  },
  {
    time: "08:20",
    agent: "Researcher · α",
    summary: "Logged 6 new competitor mentions into company memory",
    because: "The weekly report asks for a competitive snapshot",
    cost: "$0.06",
    icon: Bot,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    time: "07:31",
    agent: "Writer · α",
    summary: "Wrote the onboarding email sequence, step 1 of 4",
    because: "New signups should hear from ORQ8 within a day",
    cost: "$0.14",
    icon: Bot,
    tone: "bg-purple-50 text-purple-600",
  },
];

export function RecentActions() {
  return (
    <div className="trezo-card mb-[25px] rounded-md bg-white p-[20px] dark:bg-[#0c1427] md:p-[25px]">
      <div className="trezo-card-header mb-[20px] flex items-center justify-between md:mb-[25px]">
        <div className="trezo-card-title">
          <h5 className="!mb-0">Recent agent actions</h5>
        </div>
        <a
          href="/app/activity"
          className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
        >
          Full log <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      <div className="trezo-card-content">
        <ul>
          {actions.map((a) => (
            <li
              key={a.time}
              className="mb-[15px] flex items-center justify-between last:mb-0 md:mb-[18px]"
            >
              <div className="flex items-center">
                <div
                  className={`flex h-[41px] w-[41px] items-center justify-center rounded-full ${a.tone} ltr:mr-[12px] rtl:ml-[12px]`}
                >
                  <a.icon className="h-5 w-5" />
                </div>
                <div>
                  <span className="mb-[3px] block font-medium text-black dark:text-white md:mb-px">
                    {a.agent}{" "}
                    <span className="font-normal text-muted">{a.summary}</span>
                  </span>
                  <span className="flex items-start gap-1.5 text-sm text-muted">
                    <span className="font-mono font-semibold text-emerald">
                      because
                    </span>
                    {a.because}
                  </span>
                </div>
              </div>

              <div className="ltr:ml-[12px] rtl:mr-[12px] ltr:text-right rtl:text-left">
                <span className="block font-medium text-black dark:text-white">
                  <time className="font-mono text-xs tabular-nums text-muted">
                    {a.time}
                  </time>
                </span>
                <span className="mt-[3px] block font-mono text-xs tabular-nums text-muted">
                  {a.cost}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-[20px] rounded-md bg-canvas px-[14px] py-[12px] font-mono text-[10px] uppercase tracking-wide text-muted">
          Live log · the event store lands in Phase 2
        </p>
      </div>
    </div>
  );
}
