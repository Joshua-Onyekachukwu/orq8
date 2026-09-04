import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../lib/api";

// Web proxy for the Company Builder API — forwards authenticated requests to
// the ORQ8 backend. All real orchestration happens server-side.

function getToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function POST(request: NextRequest) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action"); // analyze | plan | activate

  if (!action || !["analyze", "plan", "activate"].includes(action)) {
    return NextResponse.json({ error: "action must be analyze, plan, or activate" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/company-builder/${action}`, {
      method: "POST",
      headers: proxyAuthHeaders(token, "application/json"),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { code: "company_builder.unavailable", message: "Company Builder service unavailable" } },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  const token = getToken(request);
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_URL}/v1/company-builder/state`, {
      headers: proxyAuthHeaders(token),
      next: { revalidate: 15 },
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: { code: "company_builder.unavailable", message: "Company Builder service unavailable" } }, { status: 502 });
  }
}