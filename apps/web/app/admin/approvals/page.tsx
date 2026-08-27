import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { AdminApprovalQueue } from "../../../components/admin/admin-approval-queue";

export const metadata = { title: "Approval Queue — Admin — ORQ8" };

async function fetchApprovals(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/approvals`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: unknown[] };
    return (data?.data as unknown[]) ?? [];
  } catch {
    return [];
  }
}

export default async function AdminApprovalsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const approvals = await fetchApprovals(token);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Approval Queue</h1>
        <p className="mt-1 text-sm text-muted">
          Review and manage all AI agent approval requests across the platform.
        </p>
      </div>

      <AdminApprovalQueue approvals={approvals as Array<{ id: string; agentId: string | null; action: string; description: string | null; cost: number; riskLevel: string; status: string; decisionNote: string | null; decidedAt: string | null; createdAt: string }>} />
    </div>
  );
}
