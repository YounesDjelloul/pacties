import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { behaviorIdInput, toBehaviorId } from '@/mcp/inputs';
import { runTool } from '@/mcp/tool-result';
import { getApprovedBehavior, getBehavior } from '@/shell/ledger/read-behaviors';
import type { ServerContext } from '@/mcp/server-context';

export function registerPlannerGetBehavior(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'get_behavior',
    {
      title: 'Get behavior',
      description: 'Get one behavior, including its pending revision if any.',
      inputSchema: { id: behaviorIdInput },
      annotations: { readOnlyHint: true },
    },
    (input) => runTool(async () => ({ behavior: await getBehavior(await context.project(), toBehaviorId(input.id)) })),
  );
}

export function registerTesterGetBehavior(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'get_behavior',
    {
      title: 'Get behavior',
      description: 'Get one approved behavior with its description and contract.',
      inputSchema: { id: behaviorIdInput },
      annotations: { readOnlyHint: true },
    },
    (input) => runTool(async () => ({ behavior: await getApprovedBehavior(await context.project(), toBehaviorId(input.id)) })),
  );
}
