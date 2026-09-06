import Link from "next/link";
import { cookies } from "next/headers";
import { KeyRound, Plug, ArrowUpRight } from "lucide-react";
import { SettingsShell } from "../../../components/settings-shell";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "Connections" };

interface IntegrationRow {
  id: string;
  name: string;
  provider: string;
  status: string;
  error: string | null;
  connectedAt: string | null;
}

/**
 * Connections: real external-system inventory. Provider rows come from the
 * API (/v1/integrations) — statuses are live, never hard-coded "Planned".
 * Model providers (BYOK) are managed on the Providers page.
 */
export default async function ConnectionsPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  let integrations: IntegrationRow[] = [];
  if (token) {
    try {
      const res = await fetch(`${API_URL}/v1/integrations`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { data?: IntegrationRow[] } | null;
      integrations = json?.data ?? [];
    } catch {
      integrations = [];
    }
  }

  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  const rows = [
    {
      name: "GitHub",
      kind: "Engineering",
      status: byProvider.get("github")?.status ?? "Not connected",
      statusDetail: byProvider.get("github")?.error ?? null,
      via: "OAuth",
      connectedAt: byProvider.get("github")?.connectedAt ?? null,
    },
    {
      name: "Gmail",
      kind: "Communications",
      status: byProvider.get("gmail")?.status ?? "Not connected",
      statusDetail: byProvider.get("gmail")?.error ?? null,
      via: "OAuth",
      connectedAt: byProvider.get("gmail")?.connectedAt ?? null,
    },
    {
      name: "Linear",
      kind: "Product / Engineering",
      status: byProvider.get("linear")?.status ?? "Not connected",
      statusDetail: byProvider.get("linear")?.error ?? null,
      via: "OAuth",
      connectedAt: byProvider.get("linear")?.connectedAt ?? null,
    },
    {
      name: "OpenAI · Anthropic · more",
      kind: "Model providers",
      status: "Bring your own key",
      statusDetail: null,
      via: "BYOK",
      connectedAt: null,
    },
  ];

  const statusClass = (status: string): string => {
    if (status === "connected") return "bg-orq8-lime/10 text-orq8-green";
    if (status === "connecting" || status === "error") return "bg-amber-50 text-amber-700";
    if (status.startsWith("Not connected") || status === "Bring your own key") return "bg-canvas text-muted";
    return "bg-canvas text-muted";
  };

  const displayStatus = (status: string): string => {
    if (status === "connected") return "Connected";
    if (status === "connecting") return "Connecting";
    if (status === "error") return "Error";
    return status;
  };

  return (
    <SettingsShell
      title="Connections"
      description="The external systems ORQ8 plugs into. Connectors connect by OAuth; model providers use your own keys."
    >
      <div className="max-w-3xl rounded-xl border border-hairline bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orq8-dark text-orq8-green">
              <Plug className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">Connected systems</h2>
              <p className="text-xs text-muted">
                Live status from the ORQ8 API — nothing is hard-coded
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings/providers"
              className="inline-flex items-center gap-1.5 rounded-full bg-orq8-dark px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-lime hover:text-white"
            >
              <KeyRound className="h-3.5 w-3.5" /> Manage keys
            </Link>
            <Link
              href="/app/integrations"
              className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-green-dark"
            >
              Event rules <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
          {rows.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  <p className="truncate text-xs text-muted">
                    {c.kind} · {c.via}
                    {c.connectedAt ? ` · since ${new Date(c.connectedAt).toLocaleDateString()}` : ""}
                    {c.statusDetail ? ` · ${c.statusDetail}` : ""}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wide ${statusClass(c.status)}`}>
                {displayStatus(c.status)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SettingsShell>
  );
}
