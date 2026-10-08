import { cookies } from "next/headers";
import Link from "next/link";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import {
  CommandsDashboard,
  type CommandJob,
  type QueueHealth,
} from "../../../components/admin/commands-dashboard";

export const metadata = { title: "Commands — Admin" };

/**
 * Commands (brief §7–§8, docs/78 Phase E).
 *
 * The place this replaced — `/admin/jobs` — was a mockup: a hard-coded list of
 * "background jobs" with invented schedules, counting audit events to fill in
 * its numbers. This page reads `agent_jobs` itself: the real statuses, the real
 * rows, the real errors, and a retry that goes back through `retryJob` into the
 * queue the worker drains.
 *
 * Reads use the session cookie exactly like every other admin page, and a
 * backend that does not answer produces an explicit "unavailable" state rather
 * than zeros that read like a healthy empty queue.
 */
async function fetchJson<T>(token: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data?: T }).data ?? null;
  } catch {
    return null;
  }
}

export default async function CommandsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  const [health, recent, deadLetter] = await Promise.all([
    fetchJson<QueueHealth & { mode?: string }>(token, "/v1/admin/jobs/health"),
    fetchJson<CommandJob[]>(token, "/v1/admin/jobs/recent?limit=50"),
    fetchJson<CommandJob[]>(token, "/v1/admin/jobs/dead-letter?limit=50"),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Commands</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The live <span className="font-mono text-xs">agent_jobs</span> queue: depth, workers,
          recent work and the jobs that failed permanently.
        </p>
        <p className="mt-1 text-2xs text-ink-muted">
          Tasks are queued by the API and executed by the worker. Retry sends a dead job back
          through the same queue — no side channel.
        </p>
      </div>

      {!health ? (
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h2 className="text-sm font-semibold text-ink">The queue could not be read</h2>
          <p className="mt-2 text-sm text-ink-muted">
            The API did not answer <span className="font-mono text-xs">/v1/admin/jobs/health</span>, so
            no queue numbers are shown. Nothing is displayed rather than counts that would read like a
            real queue.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/admin/health"
              className="inline-flex h-9 items-center rounded-md border border-hairline px-3 text-ink transition-colors hover:bg-surface-secondary"
            >
              Platform health
            </Link>
            <span className="text-ink-muted">
              Queue mode is reported by the API when it answers; the worker drains only in{" "}
              <span className="font-mono">workers</span> mode.
            </span>
          </div>
        </div>
      ) : (
        <CommandsDashboard
          initialHealth={health}
          initialRecent={recent ?? []}
          initialDeadLetter={deadLetter ?? []}
          initialMode={health.mode ?? "unknown"}
        />
      )}
    </div>
  );
}
