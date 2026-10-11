import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { behaviorIdInput, dependsOnInput, interfaceInput, toBehaviorId } from '@/mcp/inputs';
import { runTool } from '@/mcp/tool-result';
import { updateBehavior } from '@/shell/ledger/update-behavior';
import type { ServerContext } from '@/mcp/server-context';

const description = [
  'Change a behavior. Omitted fields keep their current value; an empty dependsOn list clears it.',
  'A planned draft is edited in place. An approved behavior gets a pending revision: the tester keeps seeing the approved version until the developer approves the revision.',
  'Use this instead of editing code around a contract mismatch.',
].join(' ');

export function registerUpdateBehavior(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'update_behavior',
    {
      title: 'Update behavior',
      description,
      inputSchema: {
        id: behaviorIdInput,
        description: z.string().optional(),
        contract: z.object({ interface: interfaceInput.optional(), dependsOn: dependsOnInput.optional() }).optional(),
        reason: z.string().describe('Why the behavior changes; shown to the developer, never to the tester'),
      },
    },
    (input) =>
      runTool(async () => {
        const outcome = await updateBehavior(context.project, { ...input, id: toBehaviorId(input.id) }, context.now());
        return { ...outcome, nextStep: `Ask the developer to review it and run: pacties approve ${outcome.behavior.id}` };
      }),
  );
}
