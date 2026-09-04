import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Pause,
  Timer,
  Activity,
  Zap,
} from "lucide-react";

export const metadata = { title: "Background Jobs — Admin" };

interface Job {
  id: string;
  name: string;
  type: "cron" | "event" | "manual";
  status: "idle" | "running" | "completed" | "failed" | "paused";
  lastRun: string | null;
  runCount: number;
  failCount: number;
  description: string;
}

async function fetchAuditEvents(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/audit?limit=200`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const d = await res.json();
    return d.data || [];
  } catch {
    return [];
  }
}

function buildJobs(events: any[]): Job[] {
  const jobDefs: Omit<Job, "runCount" | "failCount" | "lastRun">[] = [
    {
      id: "agent-execution",
      name: "Agent Task Execution",
      type: "cron",
      status: "idle",
      description: "Processes queued agent tasks and executes AI workloads",
    },
    {
      id: "notification-dispatch",
      name: "Notification Dispatch",
      type: "cron",
      status: "idle",
      description: "Sends pending email and in-app notifications",
    },
    {
      id: "usage-reconciliation",
      name: "Usage Reconciliation",
      type: "cron",
      status: "idle",
      description: "Reconciles AI usage credits across organizations",
    },
    {
      id: "report-generation",
      name: "Weekly Report Generation",
      type: "cron",
      status: "idle",
      description: "Generates weekly performance reports for organizations",
    },
    {
      id: "cleanup-expired",
      name: "Expired Session Cleanup",
      type: "cron",
      status: "idle",
      description: "Removes expired sessions and stale data",
    },
    {
      id: "waitlist-processing",
      name: "Waitlist Processing",
      type: "event",
      status: "idle",
      description: "Processes new waitlist signups and sends confirmation emails",
    },
  ];

  return jobDefs.map((def) => {
    const taskEvents = events.filter((e: any) =>
      e.action?.includes("task.")
    );
    const notifEvents = events.filter((e: any) =>
      e.action?.includes("notification")
    );
    const waitlistEvents = events.filter((e: any) =>
      e.action?.includes("waitlist")
    );
    const creditEvents = events.filter((e: any) =>
      e.action?.includes("usage") || e.action?.includes("credit")
    );

    let runCount = 0;
    let failCount = 0;
    let lastRun: string | null = null;

    switch (def.id) {
      case "agent-execution":
        runCount = taskEvents.length;
        failCount = taskEvents.filter((e: any) => e.action?.includes("failed")).length;
        lastRun = taskEvents[0]?.createdAt || null;
        break;
      case "notification-dispatch":
        runCount = notifEvents.length;
        lastRun = notifEvents[0]?.createdAt || null;
        break;
      case "usage-reconciliation":
        runCount = creditEvents.length;
        lastRun = creditEvents[0]?.createdAt || null;
        break;
      case "waitlist-processing":
        runCount = waitlistEvents.length;
        lastRun = waitlistEvents[0]?.createdAt || null;
        break;
    }

    return { ...def, runCount, failCount, lastRun };
  });
}

export default async function AdminJobsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return (
      <div className="p-8">
        <p className="text-sm text-ink-muted">Not authenticated.</p>
      </div>
    );
  }

  const events = await fetchAuditEvents(token);
  const jobs = buildJobs(events);

  const totalRuns = jobs.reduce((s, j) => s + j.runCount, 0);
  const totalFails = jobs.reduce((s, j) => s + j.failCount, 0);
  const activeJobs = jobs.filter((j) => j.status === "running").length;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Background Jobs</h1>
        <p className="text-sm text-ink-muted mt-1">
          Monitor scheduled tasks, background workers, and cron jobs
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orq8-green/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-orq8-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{jobs.length}</p>
              <p className="text-xs text-ink-muted">Total Jobs</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orq8-lime/20 flex items-center justify-center">
              <Play className="w-5 h-5 text-orq8-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{activeJobs}</p>
              <p className="text-xs text-ink-muted">Running Now</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orq8-lime/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-orq8-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{totalRuns}</p>
              <p className="text-xs text-ink-muted">Total Executions</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{totalFails}</p>
              <p className="text-xs text-ink-muted">Failures</p>
            </div>
          </div>
        </div>
      </div>

      {/* Job List */}
      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">System Jobs</h2>
        </div>
        <div className="divide-y divide-hairline-light">
          {jobs.map((job) => (
            <div key={job.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      job.status === "running"
                        ? "bg-orq8-lime animate-pulse"
                        : job.status === "failed"
                          ? "bg-red-500"
                          : job.status === "paused"
                            ? "bg-orq8-orange"
                            : "bg-gray-300"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {job.name}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {job.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Type</p>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        job.type === "cron"
                          ? "bg-orq8-green/10 text-orq8-green"
                          : job.type === "event"
                            ? "bg-orq8-orange/10 text-orq8-orange"
                            : "bg-orq8-dark/10 text-ink"
                      }`}
                    >
                      {job.type === "cron" && <Clock className="w-3 h-3" />}
                      {job.type === "event" && <Zap className="w-3 h-3" />}
                      {job.type === "manual" && <Play className="w-3 h-3" />}
                      {job.type}
                    </span>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Runs</p>
                    <p className="text-sm font-medium text-ink">
                      {job.runCount}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Failures</p>
                    <p
                      className={`text-sm font-medium ${job.failCount > 0 ? "text-red-600" : "text-ink"}`}
                    >
                      {job.failCount}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-ink-muted">Last Run</p>
                    <p className="text-sm text-ink">
                      {job.lastRun
                        ? new Date(job.lastRun).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                      job.status === "running"
                        ? "bg-orq8-lime/20 text-orq8-green"
                        : job.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : job.status === "paused"
                            ? "bg-orq8-orange/10 text-orq8-orange"
                            : "bg-gray-100 text-ink-muted"
                    }`}
                  >
                    {job.status === "running" && <Play className="w-3 h-3" />}
                    {job.status === "paused" && <Pause className="w-3 h-3" />}
                    {job.status === "failed" && (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {job.status === "idle" && <Timer className="w-3 h-3" />}
                    {job.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cron Schedule */}
      <div className="rounded-xl border border-hairline bg-white p-6">
        <h2 className="text-sm font-semibold text-ink mb-4">
          Cron Schedule
        </h2>
        <p className="text-xs text-ink-muted mb-4">
          Background jobs are managed by the ORQ8 API server. No external cron
          scheduler is currently configured.
        </p>
        <div className="rounded-lg bg-gray-50 border border-hairline p-4">
          <p className="text-xs font-mono text-ink-muted">
            Status: Jobs execute on-demand via API triggers and event hooks.
            <br />
            Scheduler: Application-level (no external cron/worker queue).
            <br />
            Persistence: Audit events track execution history.
          </p>
        </div>
      </div>
    </div>
  );
}
