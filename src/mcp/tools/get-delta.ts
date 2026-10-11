import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { peekInput } from '@/mcp/inputs';
import { runTool } from '@/mcp/tool-result';
import { getPlannerDelta, getTesterDelta } from '@/shell/ledger/get-delta';
import type { ServerContext } from '@/mcp/server-context';

export function registerPlannerGetDelta(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'get_delta',
    {
      title: 'Get delta',
      description: 'What changed since your last call: behaviors added or revised, pending revisions, and the developer\'s approvals and rejections with reasons. Call it at the start of every turn.',
      inputSchema: { peek: peekInput },
    },
    (input) => runTool(async () => getPlannerDelta(await context.project(), { peek: input.peek ?? false })),
  );
}

export function registerTesterGetDelta(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'get_delta',
    {
      title: 'Get delta',
      description: 'Approved behaviors added or revised since your last call, with a line-level contract diff. Call it at the start of every turn and update the affected tests.',
      inputSchema: { peek: peekInput },
    },
    (input) => runTool(async () => getTesterDelta(await context.project(), { peek: input.peek ?? false })),
  );
}
