import { cookies } from "next/headers";
import Link from "next/link";

import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { PageShell } from "../../../components/page-shell";
import { AuditExport } from "./audit-export";

export const metadata = { title: "Audit trail" };

/**
 * Audit trail (docs/71 §K, marketing/headquarters-mock-v2.html `screen-audit`).
 *
 * Rows are `audit_events` — the append-only, tamper-evident trail (docs/34.4),
 * not activity: each row carries its actor, action, outcome, payload refs and
 * the `prev_hash → hash` link that makes it provable. The header states the
 * chain's actual state, verified end to end through `GET /v1/audit/verify`,
 * because "nothing here is editable" is a claim the product should be able to
 * demonstrate rather than assert.
 */

interface AuditRow {
  id: number;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorKind: string;
  agentId: string | null;
  agentRole: string | null;
  action: string;
  tool: string | null;
  inputRef: string | null;
  resultRef: string | null;
  authorization: string | null;
  approvalId: string | null;
  policyRef: string | null;
  cost: number | null;
  outcome: string;
  departmentId: string | null;
  taskId: string | null;
  occurredAt: string;
  prevHash: string;
  hash: string;
}

interface AuditMeta {
  limit: number;
  offset: number;
  total: number;
  domains: { domain: string; count: number }[];
  hasMore: boolean;
}

interface ChainVerification {
  valid: boolean;
  rows: number;
  firstBrokenId?: number;
}

async function apiGet<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ── Rendering helpers ────────────────────────────────────────────────── */

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** A ref column is often a JSON string; show the value, not the quoting. */
function readableRef(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        const summary = Object.entries(parsed as Record<string, unknown>)
          .map(([key, val]) => `${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`)
          .join(" · ");
        return summary.length > 140 ? `${summary.slice(0, 140)}…` : summary;
      }
    } catch {
      // Not JSON after all — fall through and show it as text.
    }
  }
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
}

function parseMaybeJson(value: string | null): unknown {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function actorLabel(row: AuditRow): string {
  if (row.actorName) return `${row.actorName} · ${row.actorKind}`;
  if (row.actorId) return `${row.actorType}:${row.actorId.slice(0, 8)}`;
  return row.actorKind;
}

/** The human line: the row's own detail, or the object it was about. */
function detailLine(row: AuditRow): string {
  const refs = [readableRef(row.resultRef), readableRef(row.inputRef)].filter(
    (value): value is string => value !== null,
  );
  if (refs.length > 0) return refs.join(" → ");
  if (row.tool) return row.tool;
  if (row.taskId) return `task ${row.taskId.slice(0, 8)}`;
  if (row.approvalId) return `gate ${row.approvalId.slice(0, 8)}`;
  return "—";
}

function auditPayload(row: AuditRow) {
  return {
    id: row.id,
    event: row.action,
    actor: `${row.actorType}:${row.actorId ?? ""}`,
    outcome: row.outcome,
    task_id: row.taskId,
    agent_id: row.agentId,
    approval_id: row.approvalId,
    tool: row.tool,
    authorization: row.authorization,
    policy_ref: row.policyRef,
    cost_cents: row.cost,
    input_ref: parseMaybeJson(row.inputRef),
    result_ref: parseMaybeJson(row.resultRef),
    occurred_at: new Date(row.occurredAt).toISOString(),
    prev_hash: row.prevHash,
    hash: row.hash,
  };
}

function outcomeTone(outcome: string): { dot: "" | "working" | "blocked"; text: string } {
  if (outcome === "success") return { dot: "working", text: "text-ink" };
  if (outcome === "denied") return { dot: "blocked", text: "text-ink" };
  return { dot: "blocked", text: "text-error-ink" };
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  const params = await searchParams;
  const domain = params.domain?.trim() || null;
  const query = domain ? `?limit=100&domain=${encodeURIComponent(domain)}` : "?limit=100";

  const [trail, verification] = await Promise.all([
    apiGet<{ data: AuditRow[]; meta: AuditMeta }>(`/v1/audit${query}`),
    apiGet<{ data: ChainVerification }>("/v1/audit/verify"),
  ]);

  const rows = trail?.data ?? [];
  const meta = trail?.meta ?? null;
  const verify = verification?.data ?? null;

  return (
    <PageShell pageName="Audit trail" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Governance · append-only
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Audit trail</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Every row is append-only and hash-chained. Nothing here is editable, by anyone — not
              you, not Atlas, not the platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AuditExport rows={rows} />
          </div>
        </header>

        {/* The chain's real state, verified end to end. */}
        <div className="console-card flex flex-wrap items-center gap-3 p-4">
          <span
            className="state-dot"
            data-state={verify ? (verify.valid ? "working" : "blocked") : ""}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {verify
                ? verify.valid
                  ? "Hash chain intact"
                  : `Hash chain broken at event #${verify.firstBrokenId ?? "?"}`
                : "Chain verification unavailable"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {verify
                ? verify.valid
                  ? `${verify.rows} ${verify.rows === 1 ? "event" : "events"} re-computed from the genesis hash — each row's hash matches its predecessor.`
                  : "A row no longer matches the hash it was written with. That is the signal this trail exists to give you."
                : "The API could not verify the trail just now. Nothing is hidden: export the rows and check the hashes yourself."}
            </p>
          </div>
          {meta ? (
            <span className="shrink-0 font-mono text-2xs text-muted">
              {meta.total} {meta.total === 1 ? "event" : "events"} on record
            </span>
          ) : null}
        </div>

        {/* Filters are the domains that actually exist in this org's trail. */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/audit"
            aria-current={domain === null ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              domain === null
                ? "border-hairline-strong bg-elevated text-ink"
                : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
            }`}
          >
            All
            {meta ? <span className="ml-1.5 font-mono text-2xs text-muted">{meta.domains.reduce((sum, d) => sum + d.count, 0)}</span> : null}
          </Link>
          {(meta?.domains ?? []).slice(0, 8).map((bucket) => (
            <Link
              key={bucket.domain}
              href={`/app/audit?domain=${encodeURIComponent(bucket.domain)}`}
              aria-current={domain === bucket.domain ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                domain === bucket.domain
                  ? "border-hairline-strong bg-elevated text-ink"
                  : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
              }`}
            >
              {bucket.domain}
              <span className="ml-1.5 font-mono text-2xs text-muted">{bucket.count}</span>
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="console-card p-8">
            <p className="text-sm font-medium text-ink">
              {domain ? `No ${domain} events recorded yet` : "Nothing recorded yet"}
            </p>
            <p className="mt-1 max-w-xl text-xs text-muted">
              {domain
                ? "This filter names a category this organization has not written an event for. "
                : "Sign-ins, hires, gates, task state changes and every tool call land here as they happen. "}
              {domain ? (
                <Link href="/app/audit" className="text-ink transition-colors hover:text-brand-ink">
                  Show the whole trail
                </Link>
              ) : null}
            </p>
          </div>
        ) : (
          <div className="console-card overflow-hidden">
            <div className="hidden border-b border-hairline px-3 py-2 font-mono text-2xs font-semibold uppercase tracking-wide text-muted sm:flex sm:gap-3">
              <span className="w-[104px] shrink-0">When</span>
              <span className="w-[176px] shrink-0">Event</span>
              <span className="w-[124px] shrink-0">Actor</span>
              <span className="min-w-0 flex-1">Detail</span>
              <span className="w-[52px] shrink-0 text-right">JSON</span>
            </div>
            <ul>
              {rows.map((row) => {
                const tone = outcomeTone(row.outcome);
                return (
                  <li key={row.id} className="border-b border-hairline last:border-b-0">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 transition-colors hover:bg-elevated [&::-webkit-details-marker]:hidden">
                        <span className="w-[104px] shrink-0 font-mono text-2xs tabular-nums text-muted">
                          {formatStamp(row.occurredAt)}
                        </span>
                        <span className="w-[176px] shrink-0 truncate font-mono text-2xs text-ink">
                          {row.action}
                        </span>
                        <span className="w-[124px] shrink-0 truncate text-2xs text-muted">
                          {actorLabel(row)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-ink">
                          {detailLine(row)}
                        </span>
                        <span className={`shrink-0 font-mono text-2xs ${tone.text}`}>
                          <span className="state-dot mr-1.5 inline-block align-middle" data-state={tone.dot} aria-hidden="true" />
                          {row.outcome}
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 font-mono text-2xs text-muted transition-transform group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </summary>
                      <div className="px-3 pb-3">
                        <pre className="overflow-x-auto rounded-md border border-hairline bg-canvas p-3 font-mono text-2xs leading-relaxed text-muted">
                          {JSON.stringify(auditPayload(row), null, 2)}
                        </pre>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-muted">
                          <span>
                            hash <span className="text-ink">{row.hash.slice(0, 16)}…</span>
                          </span>
                          <span>
                            prev <span className="text-ink">{row.prevHash.slice(0, 16)}…</span>
                          </span>
                          {row.agentRole ? <span>{row.agentRole}</span> : null}
                          {row.cost ? <span>{(row.cost / 100).toFixed(2)} spent</span> : null}
                          {row.taskId ? (
                            <Link
                              href={`/app/tasks/${row.taskId}`}
                              className="font-sans text-xs text-ink transition-colors hover:text-brand-ink"
                            >
                              Open the task
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {meta ? (
          <p className="font-mono text-2xs text-muted">
            Showing {rows.length} of {meta.total} {meta.total === 1 ? "event" : "events"}
            {domain ? ` in “${domain}”` : ""}
            {meta.hasMore ? " · export for the rest" : " · this is the whole trail"}
          </p>
        ) : (
          <p className="font-mono text-2xs text-muted">
            The trail could not be read just now. Reload the page to try again.
          </p>
        )}
      </div>
    </PageShell>
  );
}
