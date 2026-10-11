import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { AppError } from '@/lib/errors';
import type { BehaviorId } from '@/domain/ledger/types';

export function toolResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function toolError(error: unknown): CallToolResult {
  if (error instanceof AppError) {
    return { isError: true, content: [{ type: 'text', text: `[${error.code}] ${error.message}` }] };
  }
  process.stderr.write(`pacties: unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  return {
    isError: true,
    content: [{ type: 'text', text: '[INTERNAL] pacties hit an unexpected error; the developer can find details in the MCP server log' }],
  };
}

export async function runTool(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolResult(await work());
  } catch (error) {
    return toolError(error);
  }
}

export function approvalNextStep(id: BehaviorId): string {
  return `Keep brainstorming if anything is open; once the developer gives the green light, ask them to run "pacties approve" (or "pacties approve ${id}"), and implement only after get_delta shows it approved`;
}
