import Link from "next/link";
import { cookies } from "next/headers";
import {
  Mail,
  Shield,
  Building2,
  Activity,
  Clock,
  Globe,
  Briefcase,
  Cpu,
  CheckCircle2,
  XCircle,
  Users,
} from "lucide-react";

import { API_URL, SESSION_COOKIE } from "../../../../lib/api";

export const metadata = { title: "User detail · ORQ8 Admin" };

/**
 * "Know each user" (docs/78 §admin-plan, docs/83 §admin-intel).
 *
 * Everything the platform legitimately knows about one account:
 *   • account metadata (profile, role, status, verification, timestamps)
 *   • organization memberships + per-org footprint (employees, tasks, goals, credits)
 *   • what they are building — the business's OWN declared profile: onboarding
 *     answers, constitution, imported sources (their words, supplied to us)
 *   • memory composition as counts — never content
 *   • active sessions (ip/UA) and the account's last 20 audit events
 *
 * The boundary (memory content, task results, message bodies) is a product
 * decision, stated in-product; the API enforces it and every view is audited.
 */

interface Detail {
  user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    platformRole: string | null;
    jobTitle: string | null;
    timezone: string | null;
    emailVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  memberships: { orgId: string; role: string; status: string; createdAt: string; orgName: string; orgPlan: string; orgStatus: string }[];
  orgFootprint: { orgId: string; agents: number; tasks: { total: number; completed: number }; goals: number; credits: { included: number; purchased: number; used: number } | null }[];
  building: {
    orgId: string;
    onboarding: {
      step: string;
      organization: { name?: string; description?: string; objective?: string; industry?: string; stage?: string; teamSize?: string } | null;
      constitution: { type?: string; name?: string; principles?: string[] } | null;
      completedAt: string | null;
    } | null;
    imports: { id: string; websiteUrl: string | null; websiteTitle: string | null; websiteSummary: string | null; description: string | null; status: string; createdAt: string }[];
    memory: { byCategory: { category: string; count: number }[]; total: number };
  }[];
  activeSessions: { id: string; createdAt: string; expiresAt: string; ip: string | null; userAgent: string | null }[];
  recentAudit: { action: string; outcome: string; occurredAt: string }[];
}

async function fetchDetail(userId: string, token: string): Promise<{ detail: Detail | null; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/users/${userId}/detail`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 403) return { detail: null, error: "Platform admin access required." };
    if (res.status === 404) return { detail: null, error: "User not found." };
    if (!res.ok) return { detail: null, error: `The admin API returned ${res.status}.` };
    const body = (await res.json()) as { data: Detail };
    return { detail: body.data };
  } catch {
    return { detail: null, error: "Could not reach the ORQ8 API." };
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

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const { detail, error } = await fetchDetail(id, token);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6">
        <Link href="/admin/users" className="text-sm text-brand-ink underline underline-offset-4">
          ← All users
        </Link>
        {detail ? (
          <>
            <h1 className="mt-2 text-2xl font-bold text-ink">{detail.user.name || detail.user.email}</h1>
            <p className="mt-1 text-sm text-muted">
              Account detail — everything the platform knows about this account. Access is recorded in the audit trail.
            </p>
          </>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-lg border border-hairline bg-white p-6">
          <p className="text-sm text-error-ink">{error}</p>
          <Link href="/admin/users" className="mt-3 inline-block text-sm text-brand-ink underline underline-offset-4">
            Back to all users
          </Link>
        </div>
      ) : !detail ? (
        <div className="rounded-lg border border-hairline bg-white p-6">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="rounded-lg border border-hairline border-l-2 border-l-warm bg-canvas px-3.5 py-2.5 text-2xs leading-relaxed text-muted">
            Account and operational metadata, plus the business&rsquo;s own declared profile (onboarding answers,
            constitution, imports). Customer memory <em>content</em>, task results and message bodies are never shown —
            they stay org-owned. This view is audited (<span className="font-mono">admin.user_detail_viewed</span>).
          </p>

          {/* Account */}
          <section className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="font-mono text-2xs uppercase tracking-wider text-muted">Account</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Email</dt>
                  <dd className="text-sm text-ink">{detail.user.email}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Email verified</dt>
                  <dd className="text-sm text-ink">
                    {detail.user.emailVerifiedAt ? `yes · ${fmtDate(detail.user.emailVerifiedAt)}` : "no"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Platform role</dt>
                  <dd className="text-sm text-ink">{detail.user.platformRole ?? "user"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Status</dt>
                  <dd className="text-sm text-ink">{detail.user.status}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Job title</dt>
                  <dd className="text-sm text-ink">{detail.user.jobTitle || "—"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Timezone</dt>
                  <dd className="text-sm text-ink">{detail.user.timezone || "—"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Registered</dt>
                  <dd className="text-sm text-ink">{fmtDate(detail.user.createdAt)}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div>
                  <dt className="font-mono text-2xs uppercase text-muted">Last updated</dt>
                  <dd className="text-sm text-ink">{fmtDate(detail.user.updatedAt)}</dd>
                </div>
              </div>
            </dl>
          </section>

          {/* Memberships + footprint */}
          <section className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="font-mono text-2xs uppercase tracking-wider text-muted">Organizations &amp; footprint</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {detail.memberships.length === 0 && (
                <p className="text-sm text-muted">No organization memberships.</p>
              )}
              {detail.memberships.map((m) => {
                const fp = detail.orgFootprint.find((f) => f.orgId === m.orgId);
                const bd = detail.building.find((b) => b.orgId === m.orgId);
                return (
                  <div key={m.orgId} className="rounded-lg border border-hairline bg-canvas p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink">{m.orgName}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-2xs font-semibold uppercase text-muted">
                        {m.role}
                      </span>
                    </div>
                    <p className="mt-0.5 text-2xs text-muted">
                      org status {m.orgStatus} · member since {new Date(m.createdAt).toISOString().slice(0, 10)}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Stat label="AI jobs / agents" value={fp?.agents ?? 0} />
                      <Stat label="Tasks" value={fp?.tasks.total ?? 0} sub={`${fp?.tasks.completed ?? 0} done`} />
                      <Stat label="Goals" value={fp?.goals ?? 0} />
                    </div>
                    {bd?.onboarding?.organization ? (
                      <div className="mt-3 border-t border-hairline pt-2">
                        <p className="text-xs font-semibold text-ink">What they say they are building</p>
                        {bd.onboarding.organization.description ? (
                          <p className="mt-1 line-clamp-4 text-2xs leading-relaxed text-muted">
                            {bd.onboarding.organization.description}
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {[
                            bd.onboarding.organization.industry,
                            bd.onboarding.organization.stage,
                            bd.onboarding.organization.teamSize,
                            bd.onboarding.organization.objective ? `goal: ${bd.onboarding.organization.objective}` : null,
                          ]
                            .filter(Boolean)
                            .map((tag) => (
                              <span key={String(tag)} className="rounded-md bg-white px-1.5 py-0.5 text-3xs text-ink">
                                {tag}
                              </span>
                            ))}
                          {bd.onboarding.constitution?.name ? (
                            <span className="rounded-md bg-white px-1.5 py-0.5 text-3xs text-ink">
                              constitution: {bd.onboarding.constitution.name}
                              {bd.onboarding.constitution.type ? ` (${bd.onboarding.constitution.type})` : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {bd && bd.imports.length > 0 ? (
                      <div className="mt-3 border-t border-hairline pt-2">
                        <p className="text-xs font-semibold text-ink">Imported sources</p>
                        <ul className="mt-1 space-y-1">
                          {bd.imports.slice(0, 3).map((im) => (
                            <li key={im.id} className="truncate text-2xs text-muted">
                              {im.websiteUrl || im.description || "(no source url)"} · {im.status}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Memory composition */}
          <section className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="font-mono text-2xs uppercase tracking-wider text-muted">
              Memory composition (counts, not content)
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {detail.building
                .flatMap((b) => b.memory.byCategory)
                .length === 0 && <p className="text-sm text-muted">No memory entries.</p>}
              {detail.building
                .flatMap((b) => b.memory.byCategory.map((m) => ({ org: b.orgId, ...m })))
                .map((m, i) => (
                  <span key={`${m.org}-${m.category}-${i}`} className="rounded-md border border-hairline px-2 py-1 text-2xs text-ink">
                    {m.category}: {m.count}
                  </span>
                ))}
            </div>
          </section>

          {/* Sessions */}
          <section className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-muted">
              <Users className="h-3.5 w-3.5" /> Recent sessions (ip · device)
            </h2>
            <ul className="mt-3 space-y-2">
              {detail.activeSessions.length === 0 && <li className="text-sm text-muted">No active sessions.</li>}
              {detail.activeSessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-mono text-2xs text-ink">{s.ip ?? "ip hidden"}</span>
                  <span className="text-2xs text-muted">
                    {fmtDate(s.createdAt)} → expires {fmtDate(s.expiresAt)}
                  </span>
                  <span className="max-w-md truncate text-2xs text-muted">{s.userAgent ?? "—"}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Audit */}
          <section className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-muted">
              <XCircle className="h-3.5 w-3.5 hidden" /> Recent activity (audit)
            </h2>
            <ul className="mt-3 space-y-1">
              {detail.recentAudit.length === 0 && <li className="text-sm text-muted">No audit events.</li>}
              {detail.recentAudit.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-4">
                  <span className="font-mono text-2xs text-ink">{a.action}</span>
                  <span className="whitespace-nowrap text-2xs text-muted">
                    {a.outcome} · {fmtDate(a.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
