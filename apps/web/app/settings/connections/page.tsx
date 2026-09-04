import Link from "next/link";
import { ArrowUpRight, KeyRound, Plug } from "lucide-react";
import { SettingsShell } from "../../../components/settings-shell";

export const metadata = { title: "Connections" };

/**
 * Connections: the external systems ORQ8 plugs into. Keys are managed on the
 * Providers page (BYOK, encrypted at rest); this page is the inventory.
 */
const connections = [
  {
    name: "OpenAI",
    kind: "Model provider",
    status: "Connected",
    via: "Bring your own key",
    dot: "bg-orq8-green",
  },
  {
    name: "Anthropic",
    kind: "Model provider",
    status: "Not connected",
    via: "Bring your own key",
    dot: "bg-muted",
  },
  {
    name: "Slack",
    kind: "Workplace",
    status: "Planned · Phase 2",
    via: "OAuth",
    dot: "bg-amber-400",
  },
  {
    name: "GitHub",
    kind: "Engineering",
    status: "Planned · Phase 2",
    via: "OAuth",
    dot: "bg-amber-400",
  },
  {
    name: "Gmail",
    kind: "Communications",
    status: "Planned · Phase 2",
    via: "OAuth",
    dot: "bg-amber-400",
  },
];

export default function ConnectionsPage() {
  return (
    <SettingsShell
      title="Connections"
      description="The tools ORQ8 plugs into. Model providers use your own keys; workplace tools connect by OAuth in Phase 2."
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
                Everything ORQ8 can reach, and how it connects
              </p>
            </div>
          </div>
          <Link
            href="/settings/providers"
            className="inline-flex items-center gap-1.5 rounded-full bg-orq8-dark px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-orq8-lime hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5" /> Manage keys
          </Link>
        </div>

        <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
          {connections.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                  <p className="truncate text-xs text-muted">
                    {c.kind} · {c.via}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wide ${
                  c.status === "Connected"
                    ? "bg-orq8-lime/10 text-orq8-green"
                    : c.status.startsWith("Planned")
                      ? "bg-amber-50 text-amber-700"
                      : "bg-canvas text-muted"
                }`}
              >
                {c.status}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
          Provider keys are encrypted at rest and never shown again after
          saving.{" "}
          <Link
            href="/settings/providers"
            className="inline-flex items-center gap-0.5 font-medium text-orq8-green hover:text-orq8-green"
          >
            Open the providers page <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
      </div>
    </SettingsShell>
  );
}
