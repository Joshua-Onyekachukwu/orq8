"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Bot,
  CheckCircle2,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";

/* ── Types ── */

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string;
  capabilities: string[];
}

interface McpTool {
  id: string;
  name: string;
  description: string | null;
  riskLevel: string;
  requiresApproval: boolean;
  requiredCapability: string | null;
  inputSchema: Record<string, unknown>;
}

interface McpServer {
  id: string;
  name: string;
  provider: string;
  status: string;
  riskLevel: string;
  tools: McpTool[];
}

interface DiscoveredTool extends McpTool {
  serverName: string;
  provider: string;
  serverStatus: string;
}

interface ExecuteResult {
  status: string;
  action: string;
  providerResourceId: string | null;
  providerUrl: string | null;
  result: unknown;
}

/* ── Helpers ── */

function statusBadge(status: string) {
  switch (status) {
    case "connected": return { label: "Connected", cls: "bg-emerald-50 text-emerald-700" };
    case "degraded": return { label: "Degraded", cls: "bg-amber-50 text-amber-700" };
    case "error": return { label: "Error", cls: "bg-red-50 text-red-700" };
    default: return { label: "Unconfigured", cls: "bg-slate-100 text-slate-600" };
  }
}

function riskBadge(risk: string) {
  switch (risk) {
    case "low": return { label: "Low", cls: "bg-emerald-50 text-emerald-700" };
    case "medium": return { label: "Medium", cls: "bg-blue-50 text-blue-700" };
    case "high": return { label: "High", cls: "bg-orange-50 text-orange-700" };
    default: return { label: "Critical", cls: "bg-red-50 text-red-700" };
  }
}

/* ── Main ── */

function McpPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredTool[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState({ name: "", provider: "github" });
  const [executing, setExecuting] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<{ tool: string; ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, mcpRes] = await Promise.all([
        fetch("/api/agents", { next: { revalidate: 15 } }),
        fetch("/api/mcp/servers", { next: { revalidate: 15 } }),
      ]);
      const [agentsJson, mcpJson] = await Promise.all([agentsRes.json(), mcpRes.json()]);
      const agentList: Agent[] = agentsJson.data ?? [];
      setAgents(agentList);
      setServers(mcpJson.data ?? []);
      if (agentList.length > 0 && !selectedAgentId) {
        const first = agentList[0];
        if (first) setSelectedAgentId(first.id);
      }
    } catch {
      setError("Could not load MCP data. Is the backend reachable?");
    } finally {
      setLoading(false);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDiscovery = useCallback(async (agentId: string) => {
    if (!agentId) return;
    try {
      const res = await fetch(`/api/mcp/discover?agentId=${encodeURIComponent(agentId)}`, { next: { revalidate: 15 } });
      const json = await res.json();
      setDiscovered(json.data?.tools ?? []);
    } catch {
      setDiscovered([]);
    }
  }, []);

  useEffect(() => {
    if (selectedAgentId) loadDiscovery(selectedAgentId);
  }, [selectedAgentId, loadDiscovery]);

  async function registerServer() {
    if (!registerForm.name.trim()) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: registerForm.name.trim(), provider: registerForm.provider }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRegisterError(json.error?.message ?? "Failed to register server");
        return;
      }
      setShowRegister(false);
      setRegisterForm({ name: "", provider: "github" });
      await load();
    } catch {
      setRegisterError("Backend unavailable");
    } finally {
      setRegistering(false);
    }
  }

  async function executeTool(tool: DiscoveredTool) {
    setExecuting(tool.id);
    setExecResult(null);
    try {
      const res = await fetch("/api/mcp/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, params: {} }),
      });
      const json = await res.json();
      if (!res.ok) {
        setExecResult({ tool: tool.name, ok: false, message: json.error?.message ?? "Execution failed" });
        return;
      }
      const data: ExecuteResult = json.data;
      setExecResult({
        tool: tool.name,
        ok: true,
        message: data.providerUrl
          ? `${data.action} succeeded (${data.providerResourceId ?? "done"}) — ${data.providerUrl}`
          : `${data.action} succeeded`,
      });
    } catch {
      setExecResult({ tool: tool.name, ok: false, message: "Backend unavailable" });
    } finally {
      setExecuting(null);
    }
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const approvalRequired = discovered.filter((t) => t.requiresApproval).length;
  const readOnly = discovered.filter((t) => !t.requiresApproval).length;

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MCP & Agent Tools</h1>
          <p className="text-sm text-muted mt-1">
            Model Context Protocol layer — agents discover and invoke external tools through secure, permissioned server registries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowRegister(true); setRegisterError(null); }}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Register server
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Register modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Register MCP server</h2>
              <button onClick={() => setShowRegister(false)} className="text-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              Connector-backed servers (GitHub, Gmail, Linear) ship with a real tool catalog and execute through the capability-checked connector chain. Custom servers are discoverable but not executable.
            </p>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select
              value={registerForm.provider}
              onChange={(e) => setRegisterForm({ ...registerForm, provider: e.target.value })}
              className="mb-3 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="github">GitHub (connector)</option>
              <option value="gmail">Gmail (connector)</option>
              <option value="linear">Linear (connector)</option>
              <option value="custom">Custom (discoverable only)</option>
            </select>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={registerForm.name}
              onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
              placeholder={registerForm.provider === "custom" ? "e.g. Internal analytics API" : "e.g. GitHub MCP"}
              className="mb-4 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {registerError && <p className="mb-3 text-sm text-red-600">{registerError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowRegister(false)} className="rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={registerServer}
                disabled={registering || !registerForm.name.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {registering && <Loader2 className="h-4 w-4 animate-spin" />}
                Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server registry */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-muted" />
          <h2 className="text-lg font-semibold">Server registry</h2>
        </div>
        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
            No MCP servers registered. Playbook companies are seeded with GitHub, Gmail and Linear catalogs automatically.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => {
              const badge = statusBadge(server.status);
              const risk = riskBadge(server.riskLevel);
              return (
                <div key={server.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{server.name}</p>
                      <p className="text-xs text-muted">{server.provider} · {server.tools.length} tools</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${risk.cls}`}>{risk.label} risk</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {server.provider === "custom" ? "discoverable only" : "connector-backed"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {server.tools.slice(0, 6).map((tool) => (
                      <span key={tool.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        <Wrench className="h-3 w-3" />
                        {tool.name}
                        {tool.requiresApproval && <Lock className="h-2.5 w-2.5 text-amber-600" />}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tool discovery */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-muted" />
          <h2 className="text-lg font-semibold">Tool discovery</h2>
        </div>
        <p className="mb-4 text-sm text-muted">
          Tools an AI employee may invoke, filtered server-side by the agent's capabilities and the server allowlist. Write actions are approval-gated — the connector chain re-checks everything at execution.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">AI employee</label>
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="rounded-lg border border-input bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name} — {agent.role}</option>
            ))}
          </select>
          {selectedAgent && (
            <span className="text-xs text-muted">
              {discovered.length} tools available · {readOnly} read-only · {approvalRequired} approval-gated
            </span>
          )}
        </div>

        {execResult && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${execResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {execResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            <span className="font-medium">{execResult.tool}:</span> {execResult.message}
          </div>
        )}

        {discovered.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
            No tools available for this AI employee. Register connector-backed MCP servers, then grant the agent the matching capabilities.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Tool</th>
                  <th className="px-4 py-2.5 font-medium">Server</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium">Gate</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {discovered.map((tool) => {
                  const risk = riskBadge(tool.riskLevel);
                  return (
                    <tr key={tool.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{tool.name}</p>
                        {tool.description && <p className="text-xs text-muted max-w-[360px] truncate">{tool.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{tool.serverName}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${risk.cls}`}>{risk.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {tool.requiresApproval ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                            <Lock className="h-3 w-3" /> Approval
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600">Auto</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!tool.requiresApproval && tool.serverStatus === "connected" ? (
                          <button
                            onClick={() => executeTool(tool)}
                            disabled={executing === tool.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                          >
                            {executing === tool.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <TerminalSquare className="h-3 w-3" />}
                            Run
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted">
                            {tool.serverStatus === "connected" ? "Requires approval" : "Connect via Integrations"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function McpRoute() {
  return (
    <PageErrorBoundary pageName="MCP & Tools">
      <McpPage />
    </PageErrorBoundary>
  );
}