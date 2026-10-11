import { describe, expect, it, vi } from 'vitest';
import { runTool, toolError, toolResult } from '@/mcp/tool-result';
import { ConflictError } from '@/lib/errors';

describe('toolResult', () => {
  it('serializes the value as indented JSON text', () => {
    expect(toolResult({ id: 'B10', retryAfter: 0.5 })).toEqual({ content: [{ type: 'text', text: '{\n  "id": "B10",\n  "retryAfter": 0.5\n}' }] });
  });
});

describe('toolError', () => {
  it('prefixes an AppError message with its code', () => {
    expect(toolError(new ConflictError('B3 changed to v4 after v3 was reviewed'))).toEqual({
      isError: true,
      content: [{ type: 'text', text: '[CONFLICT] B3 changed to v4 after v3 was reviewed' }],
    });
  });

  it('hides the details of an unexpected error from the agent and logs them', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const result = toolError(new TypeError('Cannot read properties of undefined (reading "contract") at /Users/zoë/secret/path.ts'));
    expect(result.content).toEqual([{ type: 'text', text: '[INTERNAL] pacties hit an unexpected error; the developer can find details in the MCP server log' }]);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('reading "contract"');
    stderr.mockRestore();
  });

  it('handles thrown values that are not errors', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(toolError('boom').isError).toBe(true);
    stderr.mockRestore();
  });
});

describe('runTool', () => {
  it('wraps a successful result', async () => {
    expect(await runTool(async () => ({ ok: 1 }))).toEqual(toolResult({ ok: 1 }));
  });

  it('wraps a thrown AppError', async () => {
    expect(await runTool(async () => { throw new ConflictError('x'); })).toMatchObject({ isError: true });
  });
});
