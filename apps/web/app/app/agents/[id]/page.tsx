import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchWithAuth } from "../../../../lib/api";
import { PageShell } from "../../../../components/page-shell";
import {
  EmployeeWorkspace,
  type EmployeeActivity,
  type EmployeeAgent,
  type EmployeeMemoryEntry,
  type EmployeeTask,
  type EmployeeTool,
} from "../../../../components/work/employee-workspace";

export const metadata: Metadata = {
  title: "Employee",
  description:
    "One AI employee: what it is doing, what it may do, what it knows, and what it has cost.",
};

interface ProviderRow {
  slug: string;
  name: string;
  connected: boolean;
  default_models: string[];
}

/**
 * Employee workspace (docs/71 §H).
 *
 * Server-rendered from real endpoints with `revalidate: false` — this is the
 * founder's governance surface, so a stale authority profile or a stale task
 * status would be actively misleading. The employee is read first because the
 * role decides which tool set to request; the remaining five reads are then
 * parallel.
 */
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await fetchWithAuth<EmployeeAgent>(`/v1/agents/${id}`, { revalidate: false });
  if (!agent) notFound();

  const [tasks, activity, memory, tools, providers] = await Promise.all([
    fetchWithAuth<EmployeeTask[]>(`/v1/tasks?agent_id=${id}&order=desc&limit=50`, {
      revalidate: false,
    }),
    fetchWithAuth<EmployeeActivity[]>(`/v1/activity?agent_id=${id}&limit=20`, { revalidate: false }),
    fetchWithAuth<EmployeeMemoryEntry[]>(`/v1/agent-memory?agentId=${id}&limit=25`, {
      revalidate: false,
    }),
    fetchWithAuth<EmployeeTool[]>(`/v1/tools/role/${encodeURIComponent(agent.role)}`, {
      revalidate: false,
    }),
    fetchWithAuth<ProviderRow[]>("/v1/providers", { revalidate: false }),
  ]);

  return (
    <PageShell pageName={agent.name} backHref="/app/agents">
      <EmployeeWorkspace
        agent={agent}
        tasks={tasks ?? []}
        activity={activity ?? []}
        memory={memory ?? []}
        tools={tools ?? []}
        providers={providers ?? []}
      />
    </PageShell>
  );
}
