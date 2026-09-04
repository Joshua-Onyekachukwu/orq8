import { cookies } from "next/headers";
import { Bot } from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "AI Agents — Admin — ORQ8" };

async function fetchAgents(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/agents`, {
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

function statusDot(status: string) {
  if (status === "active") return "bg-orq8-green";
  if (status === "paused") return "bg-amber-400";
  return "bg-gray-300";
}

export default async function AdminAgentsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const agents = await fetchAgents(token);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">AI Agents</h1>
        <p className="mt-1 text-sm text-muted">
          Monitor all deployed AI agents across organizations.
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas text-left">
              {["Agent", "Role", "Department", "Status", "Tasks", "Cost/Week"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-5 py-3 font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {Array.isArray(agents) && agents.length > 0 ? (
              (agents as Array<{
                id: string;
                name: string;
                role: string;
                department: string | null;
                status: string;
                tasksCompleted: number;
                weeklyCost: number;
                currentTask: string | null;
              }>).map((a) => (
                <tr key={a.id} className="hover:bg-canvas/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orq8-green-dark text-xs font-bold text-orq8-lime">
                        {a.name.charAt(0)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{a.name}</p>
                        {a.currentTask && (
                          <p className="text-xs text-muted truncate max-w-[200px]">{a.currentTask}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted">{a.role}</td>
                  <td className="px-5 py-3 text-sm text-muted">{a.department ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusDot(a.status)}`} />
                      <span className="text-xs font-medium text-ink capitalize">{a.status}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs tabular-nums text-muted">
                    {a.tasksCompleted}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs tabular-nums text-muted">
                    ${((a.weeklyCost ?? 0) / 100).toFixed(2)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center">
                  <Bot className="mx-auto h-8 w-8 text-muted/30" />
                  <p className="mt-3 text-sm text-muted">No agents deployed yet</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
