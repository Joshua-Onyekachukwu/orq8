import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchWithAuth } from "../../../../lib/api";
import { PageShell } from "../../../../components/page-shell";
import {
  DepartmentWorkspace,
  type DepartmentDetailData,
} from "../../../../components/work/department-workspace";

export const metadata: Metadata = {
  title: "Department",
  description:
    "One department: who is in it, what they are doing, what they may do, what they know, and what needs you.",
};

/**
 * Department workspace (docs/71 §G).
 *
 * One read, server-rendered with `revalidate: false`: the page is a governance
 * surface, so a stale member list or a stale pending-approval count would be
 * actively misleading. The API scopes every zone through the department's
 * members and resolves tools through the same role resolver the runtime uses.
 */
export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchWithAuth<DepartmentDetailData>(`/v1/departments/${id}`, {
    revalidate: false,
  });
  if (!detail?.department) notFound();

  return (
    <PageShell pageName={detail.department.name} backHref="/app/departments">
      <DepartmentWorkspace detail={detail} />
    </PageShell>
  );
}
