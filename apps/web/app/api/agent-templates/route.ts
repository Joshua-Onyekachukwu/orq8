import { NextRequest, NextResponse } from "next/server";
import { API_URL, proxyApiJson } from "../../../lib/api";

/** GET /api/agent-templates — list agent templates. */
export async function GET(req: NextRequest) {
  try {
    const data = await proxyApiJson(req, `${API_URL}/v1/agent-templates`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Templates unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
