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
};

type Notice = { kind: "ok" | "err"; text: string } | null;

const inputClass =
  "h-10 w-full rounded-md border border-hairline bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-orq8-green focus:outline-none focus:ring-2 focus:ring-orq8-green/20";
const labelClass = "mb-1 block text-sm font-medium text-ink";
const btnPrimary =
  "h-9 rounded-md bg-orq8-green px-4 text-sm font-medium text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50";
const btnGhost =
  "h-9 rounded-md border border-hairline px-3 text-sm text-muted transition-colors hover:border-orq8-green hover:text-orq8-green disabled:opacity-50";

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
          text: data?.error?.message ?? "Failed to save key. Check the key is valid and the API is running on :3001.",
        });
        return;
      }
      setApiKey("");
      setName("");
      setEndpointUrl("");
      setNotice({ kind: "ok", text: `${data?.data?.provider_name ?? "Provider"} key saved (encrypted at rest).` });
      await refresh();
    } catch {
      setNotice({ kind: "err", text: "Network error. Is the API running on :3001?" });
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
          text: data?.error?.message ?? `${action} failed. Check the API is running on :3001.`,
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
      setNotice({ kind: "err", text: "Network error. Is the API running on :3001?" });
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
            notice.kind === "ok" ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"
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
                className="h-4 w-4 accent-navy-800"
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
                        <a href={p.doc_url} target="_blank" rel="noreferrer" className="underline hover:text-orq8-green">
                          get a key
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    orgKeys.length > 0 ? "bg-green-50 text-green-700" : "bg-canvas text-muted"
                  }`}
                >
                  {orgKeys.length > 0 ? "Connected" : "Not connected"}
                </span>
              </div>

              {/* Model availability */}
              {p.default_models.length > 0 && (
                <div className="mt-3">
                  <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Available models</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.default_models.slice(0, 4).map((m) => (
                      <span key={m} className="rounded-full bg-gray-100 px-2 py-0.5 text-3xs font-medium text-gray-600">{m}</span>
                    ))}
                    {p.default_models.length > 4 && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-3xs font-medium text-gray-500">+{p.default_models.length - 4}</span>
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${
                              k.status === "active" ? "bg-green-500" :
                              k.status === "error" ? "bg-red-500" :
                              "bg-gray-300"
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
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button className={btnGhost} disabled={actionBusy === k.id} onClick={() => runAction(k.id, "test")}>
                            Test
                          </button>
                          <button className={btnGhost} disabled={actionBusy === k.id} onClick={() => { setRotateFor(rotateFor === k.id ? null : k.id); setRotateValue(""); }}>
                            Rotate
                          </button>
                          {confirmRevokeFor === k.id ? (
                            <button className="h-9 rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-600" onClick={() => runAction(k.id, "revoke")}>
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
