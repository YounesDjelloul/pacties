import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { dependsOnInput, interfaceInput } from '@/mcp/inputs';
import { approvalNextStep, runTool } from '@/mcp/tool-result';
import { proposeBehavior } from '@/shell/ledger/propose-behavior';
import type { ServerContext } from '@/mcp/server-context';

const description = [
  'Propose one behavior the feature must have, agreed with the developer in this chat.',
  'Describe WHAT is observable and the public API the tests will call (signatures, outputs, errors), never HOW it is implemented: the tester only ever sees the description and contract.',
  'The behavior starts as "planned" and stays invisible to the tester until the developer gives the green light with "pacties approve".',
].join(' ');

export function registerProposeBehavior(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'propose_behavior',
    {
      title: 'Propose behavior',
      description,
      inputSchema: {
        description: z.string().describe('One sentence, e.g. "transfer over daily limit returns 429"'),
        contract: z.object({ interface: interfaceInput, dependsOn: dependsOnInput.optional() }),
      },
    },
    (input) =>
      runTool(async () => {
        const behavior = await proposeBehavior(await context.project(), input, context.now());
        return { behavior, nextStep: approvalNextStep(behavior.id) };
      }),
  );
}
