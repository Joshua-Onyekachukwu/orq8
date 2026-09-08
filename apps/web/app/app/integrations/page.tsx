"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Plug,
  Zap,
  ToggleLeft,
  ToggleRight,
  X,
  Activity,
  LogIn,
  Unplug,
  CheckCircle2,
} from "lucide-react";

interface ProviderItem {
  id: string;
  name: string;
  provider: string;
  status: string;
  error: string | null;
  connectedAt: string | null;
}

interface OutcomeItem {
  id: string;
  provider: string;
  capability: string;
  action: string;
  status: string;
  summary: string | null;
  providerUrl: string | null;
  createdAt: string;
}

interface ProviderHealth {
  state: string;
  status: string;
  healthy: boolean;
  login: string | null;
  error: string | null;
  requiresReconnect: boolean;
  lastCheckedAt: string | null;
  tokenExpiresAt: string | null;
  lastOutcome: OutcomeItem | null;
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
}

interface EventRule {
  id: string;
  provider: string;
  eventType: string;
  action: "notify" | "create_task" | "ignore";
  agentId: string | null;
  taskTitleTemplate: string | null;
  requiresApproval: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type Provider = "github" | "linear" | "gmail";

const PROVIDER_META: Record<Provider, { label: string; eventTypes: string[]; note: string }> = {
  github: {
    label: "GitHub",
    eventTypes: ["issues.opened", "issues.closed", "issues.labeled", "pull_request.opened", "pull_request.closed"],
    note: "Engineer pushes, issues and pull requests",
  },
  linear: {
    label: "Linear",
    eventTypes: ["issue.created", "issue.updated", "issue.completed"],
    note: "Issue lifecycle events",
  },
  gmail: {
    label: "Gmail",
    eventTypes: ["message.new"],
    note: "Inbound email",
  },
};

const EMPTY_FORM = {
  provider: "github" as Provider,
  eventType: "issues.opened",
  action: "create_task" as EventRule["action"],
  agentId: "",
  taskTitleTemplate: "",
  requiresApproval: false,
  enabled: true,
};

function parseApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const message = (data as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Unknown";
  }
}

// Connection state (provider.status) — how the row is marked.
const connectionStyles: Record<string, string> = {
  connected: "bg-orq8-green/10 text-orq8-green",
  connecting: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-600",
  disconnected: "bg-gray-100 text-gray-500",
};

// Health state (what the last real server-side probe found).
const healthStyles: Record<string, string> = {
  healthy: "bg-orq8-green/10 text-orq8-green",
  degraded: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-600",
  error: "bg-red-100 text-red-600",
  disconnected: "bg-gray-100 text-gray-500",
};

const healthLabels: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  expired: "Expired — reconnect",
  error: "Error",
  disconnected: "Not connected",
};

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [rules, setRules] = useState<EventRule[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeItem[]>([]);
  const [healthById, setHealthById] = useState<Record<string, ProviderHealth>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [oauthMsg, setOauthMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [provRes, rulesRes, agentsRes, outcomesRes] = await Promise.all([
        fetch("/api/integrations", { cache: "no-store" }),
        fetch("/api/event-rules", { cache: "no-store" }),
        fetch("/api/agents?limit=200", { cache: "no-store" }),
        fetch("/api/connector-actions?limit=10", { cache: "no-store" }),
      ]);
      const provJson = await provRes.json().catch(() => null);
      const rulesJson = await rulesRes.json().catch(() => null);
      const agentsJson = await agentsRes.json().catch(() => null);
      const outcomesJson = await outcomesRes.json().catch(() => null);
      const list = (provJson?.data ?? []) as ProviderItem[];
      setProviders(list);
      setRules((rulesJson?.data ?? []) as EventRule[]);
      setAgents((agentsJson?.data ?? []) as AgentItem[]);
      setOutcomes((outcomesJson?.data ?? []) as OutcomeItem[]);
      // Real server-side health probe for every provider with credentials.
      const connected = list.filter((p) => p.status === "connected" || p.status === "error" || p.status === "connecting");
      for (const p of connected) {
        checkHealth(p.id);
      }
    } catch {
      setError("Could not load integrations. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // OAuth callback result banner (?oauth=status=connected|failed&login=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (oauth) {
      const status = new URLSearchParams(oauth).get("status");
      const login = new URLSearchParams(oauth).get("login");
      if (status === "connected") {
        setOauthMsg(`Connected as ${login ?? "the provider account"}. Running a health check…`);
        window.history.replaceState({}, "", "/app/integrations");
      } else if (status === "failed") {
        setOauthMsg("Connection failed. The provider rejected the authorization — check the OAuth app configuration and try again.");
      }
    }
  }, []);

  async function checkHealth(id: string) {
    setCheckingId((prev) => (prev ? prev : id));
    try {
      const res = await fetch(`/api/integrations/${id}/health`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setHealthById((prev) => ({ ...prev, [id]: json.data as ProviderHealth }));
      }
    } catch {
      // Keep the previous state — a failed probe shouldn't blank the UI.
    } finally {
      setCheckingId(null);
    }
  }

  async function reconnect(p: ProviderItem) {
    setConnectingId(p.id);
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/api/integrations/callback/${p.provider}`;
      const res = await fetch(`/api/integrations/${p.id}/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      const url = (json?.data as { url?: string } | undefined)?.url;
      if (!url) {
        setError(parseApiError(json, "Could not start OAuth — is the provider configured on the server?"));
        return;
      }
      window.location.href = url;
    } catch {
      setError("Could not start the OAuth flow.");
    } finally {
      setConnectingId(null);
    }
  }

  async function disconnect(p: ProviderItem) {
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${p.id}/oauth/disconnect`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(parseApiError(data, "Failed to disconnect."));
      } else {
        setHealthById((prev) => ({ ...prev, [p.id]: { state: "disconnected", status: "disconnected", healthy: false, login: null, error: null, requiresReconnect: false, lastCheckedAt: null, tokenExpiresAt: null, lastOutcome: null } as ProviderHealth }));
        await load();
      }
    } catch {
      setError("Failed to disconnect.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveRule() {
    if (!form.eventType.trim() || !form.action) {
      setError("Event type and action are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/event-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          eventType: form.eventType.trim(),
          action: form.action,
          agentId: form.agentId || null,
          taskTitleTemplate: form.taskTitleTemplate.trim() || null,
          requiresApproval: form.requiresApproval,
          enabled: form.enabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(parseApiError(data, "Failed to save the event rule."));
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError("Failed to save the event rule.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/event-rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(parseApiError(data, "Failed to delete the event rule."));
      } else {
        await load();
      }
    } catch {
      setError("Failed to delete the event rule.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRule(rule: EventRule) {
    setBusyId(rule.id);
    setError(null);
    try {
      const res = await fetch("/api/event-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: rule.provider,
          eventType: rule.eventType,
          action: rule.action,
          agentId: rule.agentId,
          taskTitleTemplate: rule.taskTitleTemplate,
          requiresApproval: rule.requiresApproval,
          enabled: !rule.enabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(parseApiError(data, "Failed to update the event rule."));
      } else {
        await load();
      }
    } catch {
      setError("Failed to update the event rule.");
    } finally {
      setBusyId(null);
    }
  }

  function agentName(id: string | null): string {
    if (!id) return "—";
    return agents.find((a) => a.id === id)?.name ?? "Unknown agent";
  }

  return (
    <PageErrorBoundary pageName="Integrations">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Integrations</h1>
            <p className="mt-1 text-sm text-muted">
              Connect external systems and tell us what to do when events arrive.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink/30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {oauthMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-orq8-green/30 bg-orq8-green/5 px-4 py-3 text-sm text-ink">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orq8-green" /> {oauthMsg}
          </div>
        )}

        {/* Connected providers — connection state + health state + actions */}
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-muted" />
            <h2 className="text-lg font-semibold text-ink">Connections</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            Connection = stored OAuth credentials. Health = what the last real server-side provider check found. Tokens are encrypted at rest and never shown.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {providers.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-hairline p-6 text-sm text-muted sm:col-span-2">
                No external providers connected yet. GitHub, Linear and Gmail connections will appear here.
              </div>
            )}
            {providers.map((p) => {
              const health = healthById[p.id];
              const healthState = health?.state ?? (p.status === "connected" ? "healthy" : p.status);
              return (
                <div key={p.id} className="rounded-xl border border-hairline bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${healthStyles[healthState] ?? connectionStyles[p.status] ?? connectionStyles.disconnected}`}>
                        {healthLabels[healthState] ?? p.status}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${connectionStyles[p.status] ?? connectionStyles.disconnected}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {health?.login ? `Connected as ${health.login} · ` : ""}
                    {health?.error ?? p.error ?? (p.connectedAt ? `Connected ${new Date(p.connectedAt).toLocaleDateString()}` : "Provider connection")}
                  </p>
                  {health && (
                    <dl className="mt-2 space-y-1 text-xs text-muted">
                      <div className="flex justify-between">
                        <dt>Last checked</dt>
                        <dd className="font-medium text-ink">{formatTime(health.lastCheckedAt)}</dd>
                      </div>
                      {health.tokenExpiresAt && (
                        <div className="flex justify-between">
                          <dt>Token expires</dt>
                          <dd className={`font-medium ${new Date(health.tokenExpiresAt).getTime() <= Date.now() ? "text-red-600" : "text-ink"}`}>{formatTime(health.tokenExpiresAt)}</dd>
                        </div>
                      )}
                      {health.requiresReconnect && (
                        <div className="flex justify-between">
                          <dt>Reconnect</dt>
                          <dd className="font-medium text-red-600">Required</dd>
                        </div>
                      )}
                      {health.lastOutcome && (
                        <div className="flex justify-between">
                          <dt>Last operation</dt>
                          <dd className="truncate font-medium text-ink">{health.lastOutcome.capability} · {health.lastOutcome.status}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => checkHealth(p.id)}
                      disabled={checkingId === p.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-ink/30 disabled:opacity-50"
                    >
                      {checkingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                      Test connection
                    </button>
                    <button
                      type="button"
                      onClick={() => reconnect(p)}
                      disabled={connectingId === p.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-ink/30 disabled:opacity-50"
                    >
                      {connectingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                      Reconnect
                    </button>
                    {p.status !== "disconnected" && (
                      <button
                        type="button"
                        onClick={() => disconnect(p)}
                        disabled={busyId === p.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                      >
                        {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Outcome evidence — real connector activity, queryable */}
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted" />
            <h2 className="text-lg font-semibold text-ink">Connector Activity</h2>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white">
            {outcomes.length === 0 && !loading && (
              <div className="p-6 text-center text-sm text-muted">
                No connector operations yet. Agent tool calls and founder-triggered actions are recorded here.
              </div>
            )}
            {outcomes.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Operation</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((o) => (
                    <tr key={o.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-3 capitalize text-muted">{o.provider}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{o.capability}</p>
                        {o.summary && <p className="text-xs text-muted">{o.summary}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.status === "success" ? "bg-orq8-green/10 text-orq8-green" : o.status === "failed" || o.status === "denied" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{formatTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Event rules */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-muted" />
              <h2 className="text-lg font-semibold text-ink">Event Rules</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setError(null);
                setShowForm((v) => !v);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-orq8-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark"
            >
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showForm ? "Cancel" : "New rule"}
            </button>
          </div>

          {showForm && (
            <div className="mt-4 rounded-xl border border-hairline bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-ink">Provider</span>
                  <select
                    value={form.provider}
                    onChange={(e) => {
                      const p = e.target.value as Provider;
                      setForm((f) => ({ ...f, provider: p, eventType: PROVIDER_META[p].eventTypes[0]! }));
                    }}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                  >
                    {Object.entries(PROVIDER_META).map(([k, meta]) => (
                      <option key={k} value={k}>{meta.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-ink">Event type</span>
                  <select
                    value={form.eventType}
                    onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                  >
                    {PROVIDER_META[form.provider].eventTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-ink">Action</span>
                  <select
                    value={form.action}
                    onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as EventRule["action"] }))}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                  >
                    <option value="create_task">Create task for an AI employee</option>
                    <option value="notify">Notify the founder</option>
                    <option value="ignore">Ignore</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-ink">Assign to AI employee</span>
                  <select
                    value={form.agentId}
                    onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-orq8-green"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-ink">Task title template</span>
                  <input
                    type="text"
                    value={form.taskTitleTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, taskTitleTemplate: e.target.value }))}
                    placeholder="e.g. Review PR #{number}"
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-orq8-green"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={form.requiresApproval}
                    onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))}
                    className="h-4 w-4 rounded border-hairline accent-orq8-green"
                  />
                  Require founder approval
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-hairline accent-orq8-green"
                  />
                  Enabled
                </label>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={saveRule}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-orq8-green px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Saving…" : "Save rule"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white">
            {loading && rules.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading event rules…
              </div>
            )}
            {!loading && rules.length === 0 && (
              <div className="p-8 text-center text-sm text-muted">
                No event rules yet. Create one to turn webhook events into agent work.
              </div>
            )}
            {rules.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Rule</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Assignee</th>
                    <th className="px-4 py-3 font-medium">Approval</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{PROVIDER_META[rule.provider as Provider]?.label ?? rule.provider} · {rule.eventType}</p>
                        {rule.taskTitleTemplate && <p className="text-xs text-muted">→ {rule.taskTitleTemplate}</p>}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted">{rule.action.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-muted">{agentName(rule.agentId)}</td>
                      <td className="px-4 py-3 text-muted">{rule.requiresApproval ? "Yes" : "No"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => toggleRule(rule)}
                            disabled={busyId === rule.id}
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
                            title={rule.enabled ? "Disable rule" : "Enable rule"}
                          >
                            {rule.enabled ? <ToggleRight className="h-5 w-5 text-orq8-green" /> : <ToggleLeft className="h-5 w-5 text-muted" />}
                            {rule.enabled ? "On" : "Off"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRule(rule.id)}
                            disabled={busyId === rule.id}
                            className="text-muted transition-colors hover:text-red-500 disabled:opacity-50"
                            title="Delete rule"
                          >
                            {busyId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            {PROVIDER_META[form.provider].note} — webhooks must be configured with the org&apos;s secret before rules fire.
          </p>
        </section>
      </div>
    </PageErrorBoundary>
  );
}