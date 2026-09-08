import { NextRequest, NextResponse } from "next/server";
import { API_URL, proxyApiJson } from "../../../lib/api";

/**
 * GET /api/workforce — proxy for org-wide workforce summary.
 */
export async function GET(req: NextRequest) {
  try {
    const data = await proxyApiJson(req, `${API_URL}/v1/workforce/summary`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Workforce data unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
