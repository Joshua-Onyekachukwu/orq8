import { NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

// Same-origin SSE proxy for /v1/events.
//
// The browser hooks (use-realtime, use-realtime-notifications) connect to this
// route instead of the API origin directly. The session cookie is httpOnly and
// host-scoped to the web origin, so a cross-origin EventSource can never
// authenticate against the API (web and API live on different origins in dev
// AND production). Proxying server-side keeps the stream on the same origin
// and forwards the session as `Authorization: Bearer` — the same convention as
// every other /api/* route handler (lib/api.ts).
//
// Streaming responses must never be statically cached.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return new Response(
      JSON.stringify({ error: { code: "auth.unauthorized", message: "Not signed in" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/v1/events`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      },
      // The stream can stay open for minutes; don't let Next stall it.
      cache: "no-store",
    });
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "upstream.unreachable", message: "Could not reach the ORQ8 API" } }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "");
    return new Response(body || "Upstream error", {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Pipe the upstream event stream through unchanged.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      upstream.body?.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
