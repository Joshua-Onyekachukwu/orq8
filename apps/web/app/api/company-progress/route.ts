import { NextRequest, NextResponse } from "next/server";
import { API_URL, proxyApiJson } from "../../../lib/api";

/** GET /api/company-progress — real company progress from goals, tasks, and activity. */
export async function GET(req: NextRequest) {
  try {
    const data = await proxyApiJson(req, `${API_URL}/v1/company-progress`);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Progress data unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
