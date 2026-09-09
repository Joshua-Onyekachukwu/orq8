import { NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "../../../../lib/api";

/**
 * Same-origin SSE proxy for GET /v1/commands/stream.
 *
 * The Executive Agent takes ~10–60s for a full pipeline run (context build →
 * LLM intent analysis → tools → task creation → execution). This proxy lets
 * the browser watch each stage AS IT HAPPENS — same-origin so the httpOnly
 * session cookie works, following the exact convention of /api/events.
 *
 * Events (SSE `data:` JSON):
 *   { type: "stage", stage, label, status: started|completed|skipped|failed }
 *   { type: "done", result, completedStages }   — full POST /v1/commands shape
 *   { type: "error", error: { code, message } }
 *
 * Streaming responses must never be statically cached.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return new Response(
      JSON.stringify({ error: { code: "auth.unauthorized", message: "Not signed in" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const incoming = new URL(request.url);
  const upstreamUrl = `${API_URL}/v1/commands/stream?${incoming.searchParams.toString()}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      },
      // The stream can stay open for the whole pipeline; don't let Next stall it.
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
          // If the founder navigated away, stop reading the upstream stream.
          if (request.signal.aborted) {
            await reader.cancel().catch(() => {});
            controller.close();
            return;
            }
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
