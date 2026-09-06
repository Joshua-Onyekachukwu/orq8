import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../../lib/api";

// Proxy GET /v1/settings/export (owner/admin only) as a downloadable JSON file.
// Credentials, tokens and secrets are excluded server-side — see portability.ts.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in to export your company data." } },
      { status: 401 },
    );
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/settings/export`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } },
      { status: 502 },
    );
  }

  const body = await res.text();
  if (!res.ok) {
    return NextResponse.json(JSON.parse(body).error ?? { code: "export.failed", message: "Export failed" }, {
      status: res.status,
    });
  }

  const filename = `orq8-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
