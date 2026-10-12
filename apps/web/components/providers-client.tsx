"use client";

import { useCallback, useEffect, useState } from "react";

export type CatalogItem = {
  slug: string;
  name: string;
  kind: string;
  base_url: string | null;
  doc_url: string | null;
  default_models: string[];
  connected: boolean;
};

export type KeyItem = {
  id: string;
  provider: string;
  provider_name: string;
  kind: string;
  name: string | null;
  auth_type: "api_key" | "endpoint";
  mask: string;
  base_url: string | null;
  allowed_models: string[];
  enabled: boolean;
  status: string;
  last_tested_at: string | null;
  last_used_at: string | null;
  created_at: string;
  // docs/80 Phase 4 — enforcement state from the API.
  monthly_spend_ceiling: number | null;
  month_to_date_spend_usd: number;
  active_for_routing: boolean;
  routing_blocked_reason: "over_ceiling" | "disabled" | "revoked" | null;
};

type Notice = { kind: "ok" | "err"; text: string } | null;

const inputClass =
  "h-10 w-full rounded-md border border-hairline bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-deep/20";
const labelClass = "mb-1 block text-sm font-medium text-ink";
const btnPrimary =
  "h-9 rounded-md bg-brand-deep px-4 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-50";
const btnGhost =
  "h-9 rounded-md border border-hairline px-3 text-sm text-muted transition-colors hover:border-brand-deep hover:text-brand-ink disabled:opacity-50";

export function ProvidersClient({ catalog, keys: initialKeys }: { catalog: CatalogItem[]; keys: KeyItem[] }) {
  const [keys, setKeys] = useState<KeyItem[]>(initialKeys);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const [providerSlug, setProviderSlug] = useState("");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useEndpoint, setUseEndpoint] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("");

  // per-key transient state: rotate input + confirm revoke
  const [rotateFor, setRotateFor] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [confirmRevokeFor, setConfirmRevokeFor] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // docs/80 Phase 4 — per-key spending controls (ceiling + model allow-list).
  const [editControlsFor, setEditControlsFor] = useState<string | null>(null);
  const [ceilingDraft, setCeilingDraft] = useState<string>("");
  const [modelsDraft, setModelsDraft] = useState<string>("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/providers/keys");
    const data = await res.json();
    if (res.ok && data?.data) setKeys(data.data);
  }, []);

  useEffect(() => {
    if (!providerSlug && catalog.length > 0) {
      setProviderSlug(catalog.find((c) => c.kind !== "local")?.slug ?? catalog[0]?.slug ?? "");
    }
  }, [catalog, providerSlug]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        provider_slug: providerSlug,
        auth_type: useEndpoint ? "endpoint" : "api_key",
      };
      if (name.trim()) body.name = name.trim();
      body.api_key = apiKey.trim();
      if (useEndpoint) body.base_url = endpointUrl.trim();
      const res = await fetch("/api/providers/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: data?.error?.message ?? "Failed to save key. Check the key is valid and try again.",
        });
        return;
      }
      setApiKey("");
      setName("");
      setEndpointUrl("");
      setNotice({ kind: "ok", text: `${data?.data?.provider_name ?? "Provider"} key saved (encrypted at rest).` });
      await refresh();
    } catch {
      setNotice({ kind: "err", text: "Network error. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function runAction(id: string, action: "rotate" | "revoke" | "test", body?: unknown) {
    setNotice(null);
    setActionBusy(id);
    try {
      const res = await fetch(`/api/providers/keys/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: data?.error?.message ?? `${action} failed. Try again.`,
        });
        return;
      }
      if (action === "test") {
        const t = data?.data;
        setNotice({
          kind: t?.ok ? "ok" : "err",
          text: t?.message ?? (t?.ok ? "Connected" : "Test failed"),
        });
      } else if (action === "rotate") {
        setRotateFor(null);
        setRotateValue("");
        setNotice({ kind: "ok", text: "Key rotated." });
      } else {
        setConfirmRevokeFor(null);
        setNotice({ kind: "ok", text: "Key revoked." });
      }
      await refresh();
    } catch {
      setNotice({ kind: "err", text: "Network error. Check your connection and try again." });
    } finally {
      setActionBusy(null);
    }
  }

  function openControls(k: KeyItem) {
    setEditControlsFor(editControlsFor === k.id ? null : k.id);
    setCeilingDraft(k.monthly_spend_ceiling === null ? "" : String(k.monthly_spend_ceiling));
    setModelsDraft(k.allowed_models.join(", "));
  }

  // PATCH the key's spending controls. An empty ceiling clears it (uncapped);
  // an empty model list allows every model. Secrets are never sent here.
  async function saveControls(id: string) {
    setNotice(null);
    setActionBusy(id);
    try {
      const trimmed = ceilingDraft.trim();
      const body: Record<string, unknown> = {
        monthly_spend_ceiling: trimmed === "" ? null : Number(trimmed),
        allowed_models: modelsDraft
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      };
      const res = await fetch(`/api/providers/keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: data?.error?.message ?? "Failed to update spending controls.",
        });
        return;
      }
      setEditControlsFor(null);
      setNotice({ kind: "ok", text: "Spending controls updated." });
      await refresh();
    } catch {
      setNotice({ kind: "err", text: "Network error. Check your connection and try again." });
    } finally {
      setActionBusy(null);
    }
  }

  const byProvider = (p: CatalogItem) =>
    keys.filter((k) => k.provider === p.slug && k.status !== "revoked");

  return (
    <div className="mt-8 space-y-10">
      {notice && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok" ? "border-brand bg-brand-soft text-brand-ink" : "border-border-error bg-error-soft text-error-ink"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Add key */}
      <section className="rounded-xl border border-hairline bg-white p-6">
        <h2 className="text-base font-semibold text-ink">Add a provider key</h2>
        <p className="mt-1 text-sm text-muted">
          Paste your API key. It is encrypted before storage and never shown again.
        </p>
        <form onSubmit={handleSave} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="provider" className={labelClass}>
              Provider
            </label>
            <select
              id="provider"
              value={providerSlug}
              onChange={(e) => setProviderSlug(e.target.value)}
              className={inputClass}
            >
              {catalog
                .filter((c) => c.kind !== "local")
                .map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="key-name" className={labelClass}>
              Name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="key-name"
              name="key_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Production"
            />
          </div>
          <div className={useEndpoint ? "sm:col-span-2" : ""}>
            <label htmlFor="api-key" className={labelClass}>
              API key
            </label>
            <input
              id="api-key"
              name="api_key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              autoComplete="off"
              className={inputClass}
              placeholder="sk-…"
            />
          </div>
          {useEndpoint && (
            <div>
              <label htmlFor="endpoint-url" className={labelClass}>
                Base URL (OpenAI-compatible)
              </label>
              <input
                id="endpoint-url"
                name="base_url"
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                required
                className={inputClass}
                placeholder="https://your-gateway.example.com/v1"
              />
            </div>
          )}
          <div className="flex items-end justify-between gap-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={useEndpoint}
                onChange={(e) => setUseEndpoint(e.target.checked)}
                className="h-4 w-4 accent-on-ink"
              />
              Custom OpenAI-compatible endpoint
            </label>
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save key"}
            </button>
          </div>
        </form>
      </section>

      {/* Provider cards */}
      <section className="grid gap-4 md:grid-cols-2">
        {catalog.map((p) => {
          const orgKeys = byProvider(p);
          return (
            <div key={p.slug} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-ink">{p.name}</h3>
                  <p className="text-xs text-muted">
                    {p.kind === "local" ? "Local · no key required" : p.kind === "endpoint" ? "BYO endpoint" : "BYOK"}
                    {p.doc_url ? (
                      <>
                        {" · "}
                        <a href={p.doc_url} target="_blank" rel="noreferrer" className="underline hover:text-brand-ink">
                          get a key
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    orgKeys.length > 0 ? "bg-brand-soft text-brand-ink" : "bg-canvas text-muted"
                  }`}
                >
                  {orgKeys.length > 0 ? "Connected" : "Not connected"}
                </span>
              </div>

              {/* Model availability */}
              {p.default_models.length > 0 && (
                <div className="mt-3">
                  <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-ink-muted mb-1.5">Available models</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.default_models.slice(0, 4).map((m) => (
                      <span key={m} className="rounded-full bg-surface-secondary px-2 py-0.5 text-3xs font-medium text-ink-muted">{m}</span>
                    ))}
                    {p.default_models.length > 4 && (
                      <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-3xs font-medium text-ink-muted">+{p.default_models.length - 4}</span>
                    )}
                  </div>
                </div>
              )}

              {orgKeys.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No key saved for this provider.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {orgKeys.map((k) => (
                    <li key={k.id} className="rounded-md bg-canvas p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${
                              k.status === "active" ? "bg-brand-deep" :
                              k.status === "error" ? "bg-error-fill" :
                              "bg-disabled-surface"
                            }`} />
                            <p className="truncate text-sm font-medium text-ink">
                              {k.name ?? k.provider_name}
                              <span className="ml-2 font-mono text-xs text-muted">{k.mask}</span>
                            </p>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {k.auth_type === "endpoint" ? k.base_url : "API key"}
                            {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ""}
                            {k.last_tested_at ? ` · tested ${new Date(k.last_tested_at).toLocaleDateString()}` : " · not tested"}
                          </p>

                          {/* docs/80 Phase 4 — whether this key actually routes, and its spend. */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                                k.active_for_routing
                                  ? "bg-brand-soft text-brand-ink"
                                  : "bg-error-soft text-error-ink"
                              }`}
                            >
                              {k.active_for_routing
                                ? "Active for routing"
                                : k.routing_blocked_reason === "over_ceiling"
                                  ? "Blocked · over ceiling"
                                  : k.routing_blocked_reason === "disabled"
                                    ? "Blocked · disabled"
                                    : k.routing_blocked_reason === "revoked"
                                      ? "Blocked · revoked"
                                      : "Not routing"}
                            </span>
                            <span className="text-muted">
                              ${k.month_to_date_spend_usd.toFixed(2)} this month
                              {k.monthly_spend_ceiling === null
                                ? " · no ceiling"
                                : ` of $${k.monthly_spend_ceiling.toFixed(2)}`}
                            </span>
                            {k.allowed_models.length > 0 && (
                              <span className="text-muted">
                                · {k.allowed_models.length} model{k.allowed_models.length === 1 ? "" : "s"} allowed
                              </span>
                            )}
                          </div>
                          {k.monthly_spend_ceiling !== null && (
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-disabled-surface">
                              <div
                                className={`h-full rounded-full ${
                                  k.month_to_date_spend_usd >= k.monthly_spend_ceiling
                                    ? "bg-error-fill"
                                    : "bg-brand-deep"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.round(
                                      (k.month_to_date_spend_usd / k.monthly_spend_ceiling) * 100,
                                    ),
                                  )}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button className={btnGhost} disabled={actionBusy === k.id} onClick={() => runAction(k.id, "test")}>
                            Test
                          </button>
                          <button
                            className={btnGhost}
                            disabled={actionBusy === k.id}
                            onClick={() => openControls(k)}
                          >
                            {editControlsFor === k.id ? "Close" : "Controls"}
                          </button>
                          <button className={btnGhost} disabled={actionBusy === k.id} onClick={() => { setRotateFor(rotateFor === k.id ? null : k.id); setRotateValue(""); }}>
                            Rotate
                          </button>
                          {confirmRevokeFor === k.id ? (
                            <button className="h-9 rounded-md bg-error-fill px-3 text-sm font-medium text-white hover:bg-error-fill" onClick={() => runAction(k.id, "revoke")}>
                              Confirm
                            </button>
                          ) : (
                            <button className={btnGhost} disabled={actionBusy === k.id} onClick={() => setConfirmRevokeFor(k.id)}>
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                      {rotateFor === k.id && (
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            runAction(k.id, "rotate", { new_api_key: rotateValue });
                          }}
                        >
                          <input
                            type="password"
                            value={rotateValue}
                            name="new_api_key"
                            onChange={(e) => setRotateValue(e.target.value)}
                            required
                            autoComplete="off"
                            className={inputClass}
                            placeholder="New API key"
                          />
                          <button type="submit" disabled={actionBusy === k.id} className={btnPrimary}>
                            Save new
                          </button>
                        </form>
                      )}
                      {editControlsFor === k.id && (
                        <form
                          className="mt-3 space-y-3 border-t border-hairline pt-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveControls(k.id);
                          }}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`ceiling-${k.id}`} className={labelClass}>
                                Monthly ceiling (USD)
                              </label>
                              <input
                                id={`ceiling-${k.id}`}
                                type="number"
                                min={0}
                                step="1"
                                value={ceilingDraft}
                                onChange={(e) => setCeilingDraft(e.target.value)}
                                className={inputClass}
                                placeholder="Uncapped"
                              />
                              <p className="mt-1 text-xs text-muted">
                                Leave empty for uncapped. Routing skips this key once it is reached.
                              </p>
                            </div>
                            <div>
                              <label htmlFor={`models-${k.id}`} className={labelClass}>
                                Allowed models
                              </label>
                              <input
                                id={`models-${k.id}`}
                                value={modelsDraft}
                                onChange={(e) => setModelsDraft(e.target.value)}
                                className={inputClass}
                                placeholder="Empty = all models"
                              />
                              <p className="mt-1 text-xs text-muted">
                                Comma-separated. Empty allows every model on this provider.
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <button type="submit" disabled={actionBusy === k.id} className={btnPrimary}>
                              {actionBusy === k.id ? "Saving…" : "Save controls"}
                            </button>
                          </div>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
