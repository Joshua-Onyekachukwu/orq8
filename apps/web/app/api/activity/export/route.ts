import { NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE, proxyAuthHeaders } from "../../../../lib/api";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const limit = url.searchParams.get("limit") ?? "1000";

  try {
    const res = await fetch(
      `${API_URL}/v1/activity/export?format=${format}&limit=${limit}`,
      {
        headers: proxyAuthHeaders(token),
      }
    );

    if (!res.ok) {
      return new Response("Export failed", { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "text/csv";
    const disposition = res.headers.get("content-disposition") ?? `attachment; filename="audit-export.${format}"`;
    const body = await res.text();

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
      },
    });
  } catch {
    return new Response("Could not reach API", { status: 502 });
  }
}
