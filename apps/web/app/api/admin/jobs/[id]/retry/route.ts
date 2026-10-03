import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../../../lib/api";

/**
 * POST /api/admin/jobs/:id/retry — requeue a dead-lettered job.
 *
 * The API decides retryability from the job's real state; its status code and
 * reason are passed through unchanged so the operator sees why a retry was
 * refused (running / already queued / already done) instead of a generic error.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyApiJson(request, `/v1/admin/jobs/${encodeURIComponent(id)}/retry`, {
    method: "POST",
  });
}
