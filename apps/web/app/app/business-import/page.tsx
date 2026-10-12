"use client";

/**
 * Business Import (docs/76 Phase 3 migration, worst-first list).
 *
 * Rebased onto the shared `os/` structure layer. It used to hand-roll its own
 * palette — `bg-white`, `text-muted-foreground`, `rounded-xl … shadow-sm`,
 * `text-[11px]` — which is a different design language from `.console` and,
 * because `bg-white` ignores the ink theme, these surfaces stayed white in dark
 * mode. It also carried its own status colours and its own empty states.
 *
 * What is *unchanged*: every fetch, every status, every action and the order in
 * which a founder does them. The page still refuses to apply anything without an
 * explicit approval, and the approval controls still only appear while the
 * import is really `pending_approval`.
 *
 * The one judgement call: status is now read through the shared nine-state
 * vocabulary (`docs/85 §4`) instead of a local colour table, so an import that
 * is waiting on the founder reads `waiting`/`review`, an applied one reads
 * `done`, and a rejected one reads `paused` — a decision, not an error.
 */

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { PageContainer } from "../../../components/layout/page-container";
import {
  OsDataTable,
  OsEmptyPanel,
  OsErrorPanel,
  OsLoadingRows,
  OsMetricRow,
  OsPanel,
  OsSection,
  OsStateBadge,
  dateColumn,
  monoColumn,
  stateColumn,
  type OsColumn,
  type OsMetric,
} from "../../../components/os/structure";
import { type OsStatus } from "../../../components/os/primitives";

/* ── Types ── */

interface ImportFact {
  field: string;
  label: string;
  value: string;
  source: string;
  sourceType: "website" | "founder";
  sourceUrl: string | null;
  confidence: number;
  snippet: string | null;
}

interface ImportProposal {
  recommendedPlaybook: string;
  recommendedPlaybookName: string;
  reasons: string[];
  willCreate: { departments: string[]; agents: string[]; goals: string[] };
}

interface BusinessImport {
  id: string;
  description: string | null;
  websiteUrl: string | null;
  websiteTitle: string | null;
  websiteSummary: string | null;
  websiteError: string | null;
  facts: ImportFact[];
  proposal: ImportProposal | null;
  status: string;
  appliedAt: string | null;
  createdAt: string;
}

/* ── Status → the shared state vocabulary (docs/85 §4) ── */

/**
 * `analysis` means the facts are extracted and the *proposal* step is waiting
 * on the founder; `pending_approval` means a proposal exists and the decision is
 * theirs. Neither is a failure, so neither is painted red.
 */
function importOsStatus(status: string): OsStatus {
  if (status === "analysis") return { label: "Analyzed", state: "waiting" };
  if (status === "pending_approval") return { label: "Awaiting your approval", state: "review" };
  if (status === "approved") return { label: "Approved", state: "active" };
  if (status === "applied") return { label: "Applied", state: "done" };
  if (status === "rejected") return { label: "Rejected", state: "paused" };
  if (status === "failed") return { label: "Failed", state: "failed" };
  return { label: status, state: "" };
}

/** Confidence is a number the API computed — it is shown, never rounded away to a tick. */
function confidenceTone(confidence: number): string {
  if (confidence >= 0.8) return "text-ink";
  if (confidence >= 0.5) return "text-warm-ink";
  return "text-muted";
}

function errorMessage(json: { error?: { message?: string } | string } | null, fallback: string): string {
  if (!json) return fallback;
  const e = json.error;
  if (typeof e === "string") return e;
  return e?.message ?? fallback;
}

/* ── Shared button shapes ── */

const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-2xs font-semibold disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-50";
const PRIMARY_STYLE = { backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" } as const;
const INPUT =
  "mt-1.5 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-hairline-strong focus:outline-none";

function BusinessImportDashboard() {
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<BusinessImport | null>(null);
  const [history, setHistory] = useState<BusinessImport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      // `no-store`: the history has to be true immediately after a mutation, so
      // a cached list is worse than a second request.
      const res = await fetch("/api/business-imports", { cache: "no-store" });
      const json = await res.json();
      setHistory(json.data ?? []);
    } catch {
      // Non-fatal — history refreshes lazily.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function runAnalyze() {
    if (!description.trim() && !websiteUrl.trim()) {
      setError("Describe your company or provide a website URL (or both).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business-imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), websiteUrl: websiteUrl.trim() || undefined }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errorMessage(json, "Analysis failed"));
      setCurrent(json.data);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "propose" | "approve" | "reject") {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/business-imports/${current.id}/${action}`, {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(errorMessage(json, "Action was rejected by the server"));
      setCurrent(json.data);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    } finally {
      setBusy(false);
    }
  }

  /* ── Metrics — the numbers this page is actually judged on ── */

  const awaiting = history.filter((h) => h.status === "pending_approval").length;
  const applied = history.filter((h) => h.status === "applied").length;
  const factsExtracted = history.reduce((sum, h) => sum + (h.facts?.length ?? 0), 0);

  const metrics: OsMetric[] = [
    { key: "imports", label: "Imports", value: history.length },
    {
      key: "awaiting",
      label: "Awaiting your approval",
      value: awaiting,
      sub: awaiting > 0 ? "nothing is applied until you decide" : "nothing pending",
      tone: awaiting > 0 ? "warn" : "default",
    },
    { key: "applied", label: "Applied", value: applied },
    { key: "facts", label: "Facts extracted", value: factsExtracted, sub: "each with its source" },
  ];

  /* ── Fact columns — provenance is the point of this table ── */

  const factColumns: Array<OsColumn<ImportFact>> = [
    {
      key: "fact",
      header: "Fact",
      cell: (f) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{f.label}</p>
          <p className="truncate font-mono text-3xs text-muted">{f.field}</p>
        </div>
      ),
    },
    {
      key: "value",
      header: "Value",
      cell: (f) => <span className="text-sm break-words text-ink">{f.value}</span>,
    },
    {
      key: "source",
      header: "Source",
      cell: (f) => (
        <span className="font-mono text-3xs tracking-wide text-muted uppercase">
          {f.sourceType === "website" ? "from website" : "founder description"}
        </span>
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      cell: (f) => (
        <span className={`font-mono text-2xs ${confidenceTone(f.confidence)}`}>
          {Math.round(f.confidence * 100)}%
        </span>
      ),
    },
    {
      key: "evidence",
      header: "Evidence",
      hideOnMobile: true,
      cell: (f) => (
        <div className="min-w-0 max-w-md">
          {f.snippet ? (
            <p className="line-clamp-2 text-2xs leading-relaxed text-muted italic">
              “{f.snippet.slice(0, 220)}”
            </p>
          ) : (
            <span className="text-2xs text-muted">no quoted evidence</span>
          )}
          {f.sourceUrl ? (
            <p className="truncate font-mono text-3xs text-muted">{f.sourceUrl}</p>
          ) : null}
        </div>
      ),
    },
  ];

  /* ── History columns — the whole row is a way back into that import ── */

  const historyColumns: Array<OsColumn<BusinessImport>> = [
    {
      key: "import",
      header: "Import",
      cell: (imp) => (
        <button
          type="button"
          onClick={() => {
            setCurrent(imp);
            setError(null);
          }}
          className="block min-w-0 max-w-sm text-left transition-colors hover:text-brand-ink"
        >
          <span className="block truncate text-sm text-ink">
            {imp.websiteTitle ?? imp.websiteUrl ?? imp.description?.slice(0, 80) ?? "Company import"}
          </span>
          <span className="block truncate font-mono text-3xs text-muted">{imp.id.slice(0, 8)}</span>
        </button>
      ),
    },
    stateColumn<BusinessImport>("status", "State", (imp) => importOsStatus(imp.status)),
    monoColumn<BusinessImport>("facts", "Facts", (imp) => imp.facts?.length ?? 0, {
      hideOnMobile: true,
    }),
    monoColumn<BusinessImport>(
      "proposal",
      "Proposed model",
      (imp) => imp.proposal?.recommendedPlaybookName ?? "—",
      { hideOnMobile: true },
    ),
    dateColumn<BusinessImport>("created", "Created", (imp) => imp.createdAt),
  ];

  const currentStatus = current ? importOsStatus(current.status) : null;

  return (
    <PageContainer
      kicker="Company"
      title="Business Import"
      lede="Describe the company (and optionally point at its website). Facts are extracted with their source and confidence, an organization is proposed, and nothing is applied until you approve it."
      actions={
        <button type="button" onClick={loadHistory} disabled={historyLoading} className={BTN_SECONDARY}>
          {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      }
      pageName="Business Import"
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <OsErrorPanel title="That did not go through." detail={error} onRetry={() => setError(null)} />
        ) : null}

        {/* ── Input ── */}
        <OsSection
          id="analyze"
          title="Analyze a company"
          description="The website is fetched safely; if it cannot be read, the facts fall back to your description and the page says so rather than pretending it fetched anything."
        >
          <OsPanel>
            <label htmlFor="bi-desc" className="block font-mono text-2xs tracking-wider text-muted uppercase">
              Company description
            </label>
            <textarea
              id="bi-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="e.g. We run a subscription ecommerce brand selling sustainable fashion to consumers in Europe…"
              className={INPUT}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <label htmlFor="bi-url" className="block font-mono text-2xs tracking-wider text-muted uppercase">
                  Website URL
                </label>
                <input
                  id="bi-url"
                  type="text"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className={INPUT}
                />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={runAnalyze} disabled={busy} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  Analyze
                </button>
              </div>
            </div>
          </OsPanel>
        </OsSection>

        {/* ── The import being worked on ── */}
        {current ? (
          <OsSection
            id="current"
            title={current.websiteTitle ?? current.websiteUrl ?? "Company profile"}
            action={
              <button
                type="button"
                onClick={() => {
                  setCurrent(null);
                  setDescription("");
                  setWebsiteUrl("");
                  setError(null);
                }}
                className="text-2xs text-muted transition-colors hover:text-ink"
              >
                New import
              </button>
            }
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {currentStatus ? <OsStateBadge state={currentStatus.state} label={currentStatus.label} /> : null}
              <span className="font-mono text-3xs text-muted">
                created {new Date(current.createdAt).toLocaleString()}
              </span>
              {current.appliedAt ? (
                <span className="font-mono text-3xs text-muted">
                  applied {new Date(current.appliedAt).toLocaleString()}
                </span>
              ) : null}
              {current.websiteUrl ? (
                <a
                  href={current.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xs text-ink underline underline-offset-4"
                >
                  {current.websiteUrl}
                </a>
              ) : null}
            </div>

            {current.websiteError ? (
              <p className="rounded-lg border border-hairline bg-warm-soft px-3 py-2 text-2xs text-warm-ink">
                Website could not be read ({current.websiteError}) — the facts below come from your description. You can
                retry later.
              </p>
            ) : null}

            {current.websiteSummary && !current.proposal ? (
              <p className="text-2xs leading-relaxed text-muted">{current.websiteSummary}</p>
            ) : null}

            {/* Facts with provenance */}
            <OsSection
              id="facts"
              title="Structured facts with provenance"
              count={current.facts.length}
              description="Every fact carries where it came from and how confident the extraction was. Nothing below is invented to fill a row."
            >
              <OsDataTable
                columns={factColumns}
                rows={current.facts}
                rowKey={(f) => `${f.field}::${f.value.slice(0, 24)}`}
                empty={
                  <OsEmptyPanel
                    title="No structured facts were extracted."
                    hint="Add a description or a reachable website and analyze again."
                  />
                }
              />
            </OsSection>

            {/* Proposal */}
            {current.proposal ? (
              <OsPanel className="border-brand-soft bg-brand-soft/40">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Sparkles className="h-4 w-4" /> Proposed organization
                </p>
                <p className="mt-1 text-sm text-ink">
                  Recommended model: <span className="font-semibold">{current.proposal.recommendedPlaybookName}</span>
                </p>
                {current.proposal.reasons.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-2xs leading-relaxed text-muted">
                    {current.proposal.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                <OsMetricRow
                  className="mt-3 sm:grid-cols-3"
                  metrics={[
                    { key: "departments", label: "Departments", value: current.proposal.willCreate.departments.length },
                    { key: "agents", label: "AI employees", value: current.proposal.willCreate.agents.length },
                    { key: "goals", label: "Initial goals", value: current.proposal.willCreate.goals.length },
                  ]}
                />
              </OsPanel>
            ) : current.status === "analysis" ? (
              <div>
                <button
                  type="button"
                  onClick={() => runAction("propose")}
                  disabled={busy}
                  className={BTN_PRIMARY}
                  style={PRIMARY_STYLE}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate organization proposal
                </button>
              </div>
            ) : null}

            {/* The decision — only while the server really says pending_approval */}
            {current.status === "pending_approval" ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
                <button type="button" onClick={() => runAction("approve")} disabled={busy} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                  Approve &amp; apply organization
                </button>
                <button
                  type="button"
                  onClick={() => runAction("reject")}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-2xs text-error-ink transition-colors hover:bg-error-soft disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                  Reject proposal
                </button>
                <p className="text-2xs text-muted">Nothing is applied until you approve. Owners and admins only.</p>
              </div>
            ) : null}

            {current.status === "applied" ? (
              <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-2xs text-brand-ink">
                <CheckCircle2 className="h-3.5 w-3.5" /> Applied — the organization was built and the extracted facts
                were recorded into Company Brain with their provenance.
              </p>
            ) : null}
            {current.status === "rejected" ? (
              <p className="flex items-center gap-1.5 border-t border-hairline pt-4 text-2xs text-muted">
                <XCircle className="h-3.5 w-3.5" /> Rejected — nothing was applied or persisted to Company Brain.
              </p>
            ) : null}
          </OsSection>
        ) : null}

        {/* ── History ── */}
        <OsSection
          id="history"
          title="Recent imports"
          count={history.length}
          description="Open any import to see its facts, its proposal and what happened to it."
        >
          {historyLoading && history.length === 0 ? (
            <OsLoadingRows rows={3} />
          ) : history.length === 0 ? (
            <OsEmptyPanel
              title="No imports yet."
              hint="Analyze your company above; the result is kept here with its decision."
            />
          ) : (
            <>
              <OsMetricRow metrics={metrics} />
              <OsDataTable
                columns={historyColumns}
                rows={history}
                rowKey={(imp) => imp.id}
              />
            </>
          )}
        </OsSection>
      </div>
    </PageContainer>
  );
}

export default function BusinessImportPage() {
  return <BusinessImportDashboard />;
}
