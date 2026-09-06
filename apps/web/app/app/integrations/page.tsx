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
} from "lucide-react";

interface ProviderItem {
  id: string;
  name: string;
  provider: string;
  status: string;
  error: string | null;
  connectedAt: string | null;
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

const statusStyles: Record<string, string> = {
  connected: "bg-orq8-green/10 text-orq8-green",
  connecting: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-600",
  disconnected: "bg-gray-100 text-gray-500",
};

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [rules, setRules] = useState<EventRule[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [provRes, rulesRes, agentsRes] = await Promise.all([
        fetch("/api/integrations", { cache: "no-store" }),
        fetch("/api/event-rules", { cache: "no-store" }),
        fetch("/api/agents?limit=200", { cache: "no-store" }),
      ]);
      const provJson = await provRes.json().catch(() => null);
      const rulesJson = await rulesRes.json().catch(() => null);
      const agentsJson = await agentsRes.json().catch(() => null);
      setProviders((provJson?.data ?? []) as ProviderItem[]);
      setRules((rulesJson?.data ?? []) as EventRule[]);
      setAgents((agentsJson?.data ?? []) as AgentItem[]);
    } catch {
      setError("Could not load integrations. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
              Connect external systems and tell ORQ8 what to do when events arrive.
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

        {/* Connected providers */}
        <section className="mt-6">
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-muted" />
            <h2 className="text-lg font-semibold text-ink">Connections</h2>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {providers.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-hairline p-6 text-sm text-muted sm:col-span-2">
                No external providers connected yet. GitHub, Linear and Gmail connections will appear here.
              </div>
            )}
            {providers.map((p) => (
              <div key={p.id} className="rounded-xl border border-hairline bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[p.status] ?? statusStyles.disconnected}`}>
                    {p.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{p.error ?? (p.connectedAt ? `Connected ${new Date(p.connectedAt).toLocaleDateString()}` : "Provider connection")}</p>
              </div>
            ))}
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
                    className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-orq8-green"
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
