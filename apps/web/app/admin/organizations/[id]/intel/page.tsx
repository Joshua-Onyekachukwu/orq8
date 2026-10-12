import Link from "next/link";
import { cookies } from "next/headers";

import { API_URL, SESSION_COOKIE } from "../../../../../lib/api";
import { PageShell } from "../../../../../components/page-shell";

export const metadata = { title: "Org intelligence · ORQ8 Admin" };

/**
 * Admin org intelligence (docs/83 §admin-intel).
 *
 * One page per customer organization: who they are, what they are building,
 * what they consume. Backed by GET /v1/admin/organizations/:id/intel, which
 * returns counts, structures and metadata — never memory content, task
 * results or other tenant work product. That boundary is a product decision,
 * so the page states it rather than leaving it implied.
 */

interface Intel {
  organization: { id: string; name: string; slug: string; plan: string; status: string; createdAt: string };
  members: { userId: string; email: string; name: string | null; role: string; joinedAt: string }[];
  agents: {
    id: string; name: string; role: string; status: string; autonomyLevel: string;
    tasksCompleted: number; tasksFailed: number; creditsUsed: number;
  }[];
  departments: number;
  tasks: { total: number; completed: number; failed: number; active: number };
  memory: { total: number; byCategory: { category: string; count: number }[] };
  credits: { included: number; purchased: number; used: number; reserved: number; remaining: number } | null;
  aiUsage: { calls: number; tokens: number; costUsd: number };
  decisions: number;
  activeSessions: number;
  recentAudit: { action: string; occurredAt: string; outcome: string }[];
}

async function fetchIntel(orgId: string, token: string): Promise<{ intel: Intel | null; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/organizations/${orgId}/intel`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) return { intel: null, error: "Platform admin access required." };
    if (res.status === 404) return { intel: null, error: "Organization not found." };
    if (!res.ok) return { intel: null, error: `The admin API returned ${res.status}.` };
    const body = (await res.json()) as { data: Intel };
    return { intel: body.data };
  } catch {
    return { intel: null, error: "Could not reach the ORQ8 API." };
  }
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-3.5">
      <p className="font-mono text-2xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-0.5 text-2xs text-muted">{sub}</p> : null}
    </div>
  );
}

export default async function AdminOrgIntelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const { intel, error } = await fetchIntel(id, token);

  return (
    <PageShell pageName="Org intelligence" backHref="/admin/organizations">
      <div className="space-y-5">
        <header>
          <h1 className="text-lg font-semibold text-ink">Org intelligence</h1>
          {intel ? (
            <p className="text-sm text-muted">
              {intel.organization.name} · <span className="font-mono text-2xs">{intel.organization.slug}</span>
            </p>
          ) : null}
        </header>
      {error ? (
        <div className="rounded-lg border border-hairline bg-canvas p-6">
          <p className="text-sm text-error-ink">{error}</p>
          <Link href="/admin/organizations" className="mt-3 inline-block text-sm text-brand-ink underline underline-offset-4">
            Back to all organizations
          </Link>
        </div>
      ) : !intel ? (
        <div className="rounded-lg border border-hairline bg-canvas p-6">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Privacy stance — stated in-product, not implied. */}
          <p className="rounded-lg border border-hairline border-l-2 border-l-warm bg-canvas px-3.5 py-2.5 text-2xs leading-relaxed text-muted">
            Operational intelligence only — counts, structures and usage. This view never shows
            customer memory content, task results or other work product, and every access to this
            page is recorded in the organization&rsquo;s audit trail.
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Plan" value={intel.organization.plan} sub={`status: ${intel.organization.status}`} />
            <Stat label="Members" value={intel.members.length} sub={`${intel.activeSessions} active session(s)`} />
            <Stat label="AI employees" value={intel.agents.length} sub={`${intel.departments} department(s)`} />
            <Stat
              label="Tasks"
              value={intel.tasks.total}
              sub={`${intel.tasks.completed} completed · ${intel.tasks.failed} failed · ${intel.tasks.active} active`}
            />
            <Stat
              label="Credits used"
              value={intel.credits ? intel.credits.used : "—"}
              sub={intel.credits ? `${intel.credits.remaining} remaining of ${intel.credits.included + intel.credits.purchased}` : "no balance row"}
            />
            <Stat label="AI calls" value={intel.aiUsage.calls} sub={`${intel.aiUsage.tokens.toLocaleString()} tokens`} />
            <Stat
              label="Provider cost"
              value={`$${intel.aiUsage.costUsd.toFixed(4)}`}
              sub="billed to the platform, from llm_performance"
            />
            <Stat label="Company memory" value={intel.memory.total} sub={`${intel.decisions} decision(s)`} />
          </div>

          <section className="rounded-lg border border-hairline bg-canvas p-4">
            <h2 className="font-mono text-2xs uppercase tracking-wider text-muted">What they are building</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-ink">Members</p>
                <ul className="mt-2 space-y-1.5">
                  {intel.members.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{m.name || m.email}</span>
                      <span className="text-2xs text-muted">{m.role}</span>
                    </li>
                  ))}
                  {intel.members.length === 0 && <li className="text-sm text-muted">No members.</li>}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink">AI employees</p>
                <ul className="mt-2 space-y-1.5">
                  {intel.agents.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-ink">
                        {a.name} <span className="text-2xs text-muted">{a.role}</span>
                      </span>
                      <span className="shrink-0 text-2xs text-muted">
                        {a.autonomyLevel} · {a.tasksCompleted}✓ {a.tasksFailed}✗ · {a.creditsUsed}cr
                      </span>
                    </li>
                  ))}
                  {intel.agents.length === 0 && <li className="text-sm text-muted">No employees hired yet.</li>}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-hairline bg-canvas p-4">
            <h2 className="font-mono text-2xs uppercase tracking-wider text-muted">Memory composition (counts, not content)</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {intel.memory.byCategory.length === 0 && <p className="text-sm text-muted">No memory entries.</p>}
              {intel.memory.byCategory.map((m) => (
                <span key={m.category} className="rounded-md border border-hairline px-2 py-1 text-2xs text-ink">
                  {m.category}: {m.count}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-hairline bg-canvas p-4">
            <h2 className="font-mono text-2xs uppercase tracking-wider text-muted">Recent activity (audit)</h2>
            <ul className="mt-2 space-y-1">
              {intel.recentAudit.map((a, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-2xs text-ink">{a.action}</span>
                  <span className="text-2xs text-muted">
                    {a.outcome} · {new Date(a.occurredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                </li>
              ))}
              {intel.recentAudit.length === 0 && <li className="text-sm text-muted">No audit events.</li>}
            </ul>
          </section>

          <Link href="/admin/organizations" className="inline-block text-sm text-brand-ink underline underline-offset-4">
            Back to all organizations
          </Link>
        </div>
      )}
      </div>
    </PageShell>
  );
}
