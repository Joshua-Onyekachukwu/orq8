"use client";

/**
 * Client for the Executive Agent streaming endpoint (GET /api/commands/stream).
 *
 * The full pipeline (context → LLM intent → tools → tasks → execution) takes
 * 10–60s. Instead of one blocked POST, the UI consumes an SSE stream of stage
 * events and renders live progress ("Analyzing your command…"), then receives
 * the full result — the exact same shape as POST /api/commands — in a final
 * `done` event.
 *
 * Implemented with fetch + manual SSE parsing (EventSource cannot send the
 * POST-style auth this app uses elsewhere, and fetch keeps the logic in one
 * place). Falls back gracefully: on stream failure the caller receives an
 * error result shaped like the non-streaming one, never a hang.
 */

export interface StreamStageEvent {
  type: "stage";
  stage: string;
  label: string;
  status: "started" | "completed" | "skipped" | "failed";
  detail?: Record<string, unknown>;
  reason?: string;
  error?: string;
}

export type CommandStreamEvent = StreamStageEvent | { type: "done"; result: unknown; completedStages: string[] } | { type: "error"; error: { code: string; message: string } };

export interface CommandStreamOptions {
  command: string;
  /** Same shape as POST /api/commands `context` — sent as a JSON param. */
  context?: Record<string, unknown>;
  /** Free-form founder context note (e.g. the agent panel's page context). */
  contextNote?: string;
  onStage?: (event: StreamStageEvent) => void;
  signal?: AbortSignal;
}

/**
 * Error raised for stream failures. `pipelineStarted` distinguishes two very
 * different cases:
 *   - false → the stream never got far enough for the backend to do real work
 *     (route missing, proxy down, auth failure). The caller may safely fall
 *     back to the buffered POST /api/commands.
 *   - true  → the pipeline already ran (or was mid-flight) when the stream
 *     failed. Re-issuing the command could double-execute/double-charge, so
 *     the caller must surface an error instead of retrying blindly.
 */
export class CommandStreamError extends Error {
  readonly pipelineStarted: boolean;
  constructor(message: string, pipelineStarted: boolean) {
    super(message);
    this.name = "CommandStreamError";
    this.pipelineStarted = pipelineStarted;
  }
}

/**
 * Run a command through the streaming Executive Agent endpoint.
 * Resolves with the parsed `result` from the final `done` event, or throws
 * with a user-presentable message.
 */
export async function runCommandStream(options: CommandStreamOptions): Promise<any> {
  const params = new URLSearchParams({ command: options.command });
  if (options.context && Object.keys(options.context).length > 0) {
    // JSON-encoded so the backend parses the SAME nested shape as the POST body.
    params.set("context", JSON.stringify(options.context));
  }
  if (options.contextNote) params.set("contextNote", options.contextNote);

  const res = await fetch(`/api/commands/stream?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    cache: "no-store",
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new CommandStreamError(
      body?.error?.message ?? body?.error ?? `The Executive Agent is unavailable (${res.status}).`,
      false,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let finalResult: unknown = null;
  let streamError: string | null = null;
  let pipelineStarted = false;

  const handleEvent = (raw: string) => {
    if (!raw.startsWith("data:")) return;
    let event: CommandStreamEvent;
    try {
      event = JSON.parse(raw.slice(5).trim());
    } catch {
      return; // Ignore malformed frames — never crash on a partial write.
    }
    if (event.type === "stage") {
      pipelineStarted = true;
      options.onStage?.(event);
    } else if (event.type === "done") {
      pipelineStarted = true;
      finalResult = event.result;
    } else if (event.type === "error") {
      pipelineStarted = true;
      streamError = event.error?.message ?? "The Executive Agent encountered an error.";
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (line.trim().length > 0) handleEvent(line.trim());
      }
    }
  }
  // Flush any trailing frame (some proxies close without the final blank line).
  if (buffer.trim().length > 0) {
    for (const line of buffer.split("\n")) {
      if (line.trim().length > 0) handleEvent(line.trim());
    }
  }

  if (streamError) throw new CommandStreamError(streamError, pipelineStarted);
  if (finalResult === null) {
    throw new CommandStreamError(
      "The Executive Agent stream ended before the command completed.",
      pipelineStarted,
    );
  }
  return finalResult;
}
