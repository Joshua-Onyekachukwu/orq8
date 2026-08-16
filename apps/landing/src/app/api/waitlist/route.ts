import { NextRequest } from "next/server";

const API_BASE = process.env.ORQ8_API_URL ?? "http://localhost:3001";

// POST /api/waitlist — public landing funnel (no session needed).
// Forwards to the ORQ8 API (same contract as apps/web's proxy).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return Response.json(
      { error: { message: "Email is required." } },
      { status: 400 }
    );
  }
  try {
    const res = await fetch(`${API_BASE}/api/v1/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: { message: "The waitlist service is unavailable right now." } },
      { status: 503 }
    );
  }
}
