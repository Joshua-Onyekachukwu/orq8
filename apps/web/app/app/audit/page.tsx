import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { ShieldCheck } from "lucide-react";
import { AuditExport } from "./audit-export";
import { PageShell } from "../../../components/page-shell";

export const metadata = { title: "Audit Trail" };

async function fetchActivity() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/v1/activity?limit=500`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export default async function AuditPage() {
  const events = await fetchActivity();

  return (
    <PageShell pageName="Audit Trail" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a5c2e]">
            Governance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Audit Trail
          </h1>
          <p className="mt-1 text-sm text-muted">
            Immutable record of every action, decision, and change across your organization.
          </p>
        </div>
        <AuditExport events={events} />
      </header>

      {events.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No audit events yet</p>
          <p className="mt-1 text-sm text-muted">
            Actions will be recorded here as your AI workforce executes tasks and decisions are made.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-white">
          <table className="w-full">
            <thead>
              <tr className="bg-canvas text-left">
                {["Time", "Actor", "Action", "Outcome"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {events.map((e: Record<string, unknown>) => (
                <tr key={String(e.id)}>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                    {formatTime(String(e.occurred_at ?? e.occurredAt ?? ""))}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-ink">
                    {String(e.actor_type ?? e.actorType ?? "system")}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-ink">
                    {String(e.action ?? "—")}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                      String(e.outcome) === "success" ? "bg-[#B8FF66]/10 text-[#1a5c2e]" :
                      String(e.outcome) === "denied" ? "bg-red-100 text-red-600" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {String(e.outcome ?? "—")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </PageShell>
  );
}
