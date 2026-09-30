import {
  getToolsForRole,
  type ToolDefinition,
  type ToolExecutionResult,
} from './tool-registry.js';

/**
 * Tools inside task execution (docs/66 §66.14, docs/68 MVP-030).
 *
 * `executeTool` is the one function that carries the whole tool contract:
 * authority, the approval gate, the idempotency key, the credit charge, and the
 * audit row for both a denial and an execution. It had **no caller anywhere in
 * the API** — not the Executive Agent, not the executor — so an AI employee
 * could be asked to research a market, write a report or send an email and could
 * only answer from the model's head, with the registry's careful gate never
 * running.
 *
 * The executor is the right caller: work is where tools are needed. The model is
 * offered exactly the tools its role may use and one machine-readable way to ask
 * for one. What it may then actually run is decided by the registry, not by this
 * prompt — the prompt can be wrong without granting anything.
 */

export interface TaskToolRequest {
  toolId: string;
  params: Record<string, unknown>;
}

/**
 * How many tool rounds one task may run before the model must answer.
 *
 * Bounded on purpose: every round is another model call and another possible
 * tool charge, and an agent that keeps asking for tools must eventually produce
 * an answer or an honest failure.
 */
export const MAX_TASK_TOOL_ROUNDS = 3;

const TOOL_BLOCK = /```tool[ \t]*\r?\n([\s\S]*?)```/i;

function describeParams(tool: ToolDefinition): string {
  if (tool.parameters.length === 0) return 'no parameters';
  return tool.parameters
    .map((param) => `${param.name}:${param.type}${param.required ? '' : '?'}`)
    .join(', ');
}

/** The tool section of the execution prompt, or null when the role has none. */
export function buildToolSection(role: string): string | null {
  const tools = getToolsForRole(role);
  if (tools.length === 0) return null;

  const lines = tools.map(
    (tool) =>
      `- ${tool.id} — ${tool.name}: ${tool.description} (params: ${describeParams(tool)}; ` +
      `risk ${tool.riskLevel}; ${tool.creditCost} credit${tool.creditCost === 1 ? '' : 's'})`,
  );

  return [
    'You can use tools to do this work. To request one, reply with ONLY a fenced block:',
    '',
    '```tool',
    '{"toolId": "<id>", "params": {"<name>": "<value>"}}',
    '```',
    '',
    'You will receive the result and continue. If the work needs no tool, answer normally.',
    '',
    'Available to you:',
    ...lines,
  ].join('\n');
}

/**
 * Read the model's tool request, or null when it answered normally.
 *
 * Strict on purpose: an unparseable block is treated as a normal answer rather
 * than guessed at, because a guessed tool call would run real work.
 */
export function parseToolRequest(text: string): TaskToolRequest | null {
  const match = TOOL_BLOCK.exec(text);
  const body = match?.[1];
  if (!body) return null;

  try {
    const parsed = JSON.parse(body.trim()) as { toolId?: unknown; params?: unknown };
    if (typeof parsed.toolId !== 'string' || parsed.toolId.trim().length === 0) return null;
    return {
      toolId: parsed.toolId.trim(),
      params:
        parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : {},
    };
  } catch {
    return null;
  }
}

/** What the model is told after a tool ran. Bounded: a result, not a transcript. */
export function formatToolResultForPrompt(toolId: string, result: ToolExecutionResult): string {
  if (result.approvalRequired) {
    return `Tool "${toolId}" needs the founder's approval and has not run.`;
  }
  if (!result.success) {
    return `Tool "${toolId}" did not run: ${result.error ?? 'unknown error'}.`;
  }
  const output =
    typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? null);
  return `Tool "${toolId}" succeeded. Output:\n${(output ?? '').slice(0, 2000)}`;
}

/** One line per tool call, for the task record. */
export function describeToolCall(toolId: string, result: ToolExecutionResult): string {
  const seconds = Math.round(result.durationMs / 100) / 10;
  if (result.approvalRequired) return `${toolId}: stopped for your approval`;
  if (!result.success) return `${toolId}: refused (${result.error ?? 'unknown error'})`;
  return `${toolId}: ran in ${seconds}s, ${result.creditsConsumed} credit${
    result.creditsConsumed === 1 ? '' : 's'
  }`;
}
