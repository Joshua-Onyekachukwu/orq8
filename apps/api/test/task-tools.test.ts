import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as registry from '../src/services/tool-registry.js';
import { registerBuiltinTools, type ToolExecutionResult } from '../src/services/tool-registry.js';
import {
  buildToolSection,
  describeToolCall,
  formatToolResultForPrompt,
  parseToolRequest,
} from '../src/services/task-tools.js';

/**
 * The wire between a model's tool request and the registry (docs/68 MVP-030).
 *
 * Parsing is strict by design: an unreadable block is treated as a normal answer
 * rather than guessed at, because a guessed tool call would run real work and
 * spend real credits. These cases pin that.
 */

beforeAll(() => {
  registerBuiltinTools();
});

function result(over: Partial<ToolExecutionResult> = {}): ToolExecutionResult {
  return {
    success: true,
    output: 'the numbers say growth is holding',
    creditsConsumed: 2,
    durationMs: 1240,
    toolId: 'analyze_data',
    approvalRequired: false,
    ...over,
  };
}

describe('the tool section of the execution prompt', () => {
  it('offers a role its own tools, with the one way to ask for one', () => {
    const section = buildToolSection('data_analyst');

    expect(section).toContain('analyze_data');
    expect(section).toContain('```tool');
    expect(section).toContain('"toolId"');
    // Nothing the role is not entitled to is advertised.
    expect(section).not.toContain('write_email');
  });

  it('offers only the open-to-everyone tools to a role it does not know', () => {
    // The registry keeps some tools open to all roles and some restricted. An
    // unknown role must not be handed the restricted ones.
    const section = buildToolSection('role_that_does_not_exist');

    expect(section).toContain('web_search');
    expect(section).not.toContain('analyze_data');
  });

  it('says nothing at all when the role may use no tool', () => {
    const spy = vi.spyOn(registry, 'getToolsForRole').mockReturnValue([]);
    try {
      expect(buildToolSection('data_analyst')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('reading a tool request', () => {
  it('reads a fenced request, with prose around it', () => {
    const text = [
      'I need current data first.',
      '```tool',
      '{"toolId": "analyze_data", "params": {"data_description": "pilot metrics"}}',
      '```',
    ].join('\n');

    expect(parseToolRequest(text)).toEqual({
      toolId: 'analyze_data',
      params: { data_description: 'pilot metrics' },
    });
  });

  it('treats a normal answer as no request', () => {
    expect(parseToolRequest('Here is the analysis you asked for.')).toBeNull();
    expect(parseToolRequest('')).toBeNull();
  });

  it('refuses to guess at a broken block', () => {
    expect(parseToolRequest('```tool\n{"toolId": "analyze_data"\n```')).toBeNull();
    expect(parseToolRequest('```tool\n{"params": {}}\n```')).toBeNull();
    expect(parseToolRequest('```tool\n{"toolId": "   "}\n```')).toBeNull();
  });

  it('normalises a missing or non-object params field to an empty call', () => {
    expect(parseToolRequest('```tool\n{"toolId": "web_search"}\n```')).toEqual({
      toolId: 'web_search',
      params: {},
    });
    expect(parseToolRequest('```tool\n{"toolId": "web_search", "params": [1, 2]}\n```')).toEqual({
      toolId: 'web_search',
      params: {},
    });
  });
});

describe('what the model is told afterwards', () => {
  it('hands back the output of a successful call', () => {
    const text = formatToolResultForPrompt('analyze_data', result());

    expect(text).toContain('succeeded');
    expect(text).toContain('growth is holding');
  });

  it('bounds a huge output instead of pasting it into the next prompt', () => {
    const text = formatToolResultForPrompt('analyze_data', result({ output: 'x'.repeat(5000) }));

    expect(text.length).toBeLessThan(2200);
  });

  it('says a refused call did not run, and why', () => {
    expect(
      formatToolResultForPrompt('analyze_data', result({ success: false, error: 'forbidden' })),
    ).toContain('did not run: forbidden');
    expect(
      formatToolResultForPrompt(
        'write_email',
        result({ success: false, approvalRequired: true, approvalId: 'a1' }),
      ),
    ).toContain("founder's approval");
  });
});

describe('the line the task record keeps', () => {
  it('distinguishes a run, a refusal and a stop for approval', () => {
    expect(describeToolCall('analyze_data', result())).toBe(
      'analyze_data: ran in 1.2s, 2 credits',
    );
    expect(describeToolCall('analyze_data', result({ success: false, error: 'forbidden' }))).toBe(
      'analyze_data: refused (forbidden)',
    );
    expect(describeToolCall('write_email', result({ approvalRequired: true }))).toBe(
      'write_email: stopped for your approval',
    );
  });
});
