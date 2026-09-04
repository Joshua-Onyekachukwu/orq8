import { cookies } from "next/headers";
import { Activity } from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "Activity Log — Admin — ORQ8" };

async function fetchActivity(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/activity?limit=50`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: unknown[] };
    return data?.data ?? [];
  } catch {
    return [];
  }
}

function typeColor(type: string) {
  if (type.includes("approved")) return "bg-[#1a5c2e]/10 text-[#1a5c2e]";
  if (type.includes("rejected")) return "bg-red-50 text-red-600";
  if (type.includes("deployed") || type.includes("executed")) return "bg-blue-50 text-blue-600";
  if (type.includes("created") || type.includes("hired")) return "bg-purple-50 text-purple-600";
  return "bg-gray-100 text-gray-600";
}

export default async function AdminActivityPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const activity = await fetchActivity(token);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Activity Log</h1>
        <p className="mt-1 text-sm text-muted">
          Complete history of all platform events and agent actions.
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas text-left">
              {["Time", "Type", "Summary", "Cost", "Dept"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {Array.isArray(activity) && activity.length > 0 ? (
              (activity as Array<{
                id: number;
                type: string;
                summary: string;
                reason: string | null;
                cost: number;
                department: string | null;
                occurredAt: string;
              }>).map((e) => (
                <tr key={e.id} className="hover:bg-canvas/50">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted">
                    {new Date(e.occurredAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${typeColor(e.type)}`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm text-ink">{e.summary}</p>
                    {e.reason && (
                      <p className="mt-0.5 text-xs text-muted">Because: {e.reason}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-muted">
                    {e.cost > 0 ? `$${(e.cost / 100).toFixed(2)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                    {e.department ?? "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center">
                  <Activity className="mx-auto h-8 w-8 text-muted/30" />
                  <p className="mt-3 text-sm text-muted">No activity recorded yet</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
