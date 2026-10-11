import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { statusInput } from '@/mcp/inputs';
import { runTool } from '@/mcp/tool-result';
import { listApprovedBehaviors, listBehaviors } from '@/shell/ledger/read-behaviors';
import type { ServerContext } from '@/mcp/server-context';

export function registerPlannerListBehaviors(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'list_behaviors',
    {
      title: 'List behaviors',
      description: 'List behaviors with their status, version and any pending revision, plus a count per status. Rejected behaviors are hidden unless requested.',
      inputSchema: {
        status: z.array(statusInput).optional().describe('Only return behaviors with one of these statuses'),
        includeRejected: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (input) =>
      runTool(async () =>
        listBehaviors(await context.project(), {
          ...(input.status === undefined ? {} : { statuses: input.status }),
          ...(input.includeRejected === undefined ? {} : { includeRejected: input.includeRejected }),
        }),
      ),
  );
}

export function registerTesterListBehaviors(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'list_behaviors',
    {
      title: 'List behaviors',
      description: 'List every approved behavior you must cover with tests, with its description, contract, version and status.',
      annotations: { readOnlyHint: true },
    },
    () => runTool(async () => ({ behaviors: await listApprovedBehaviors(await context.project()) })),
  );
}
