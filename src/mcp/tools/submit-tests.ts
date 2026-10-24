import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { behaviorIdInput, toBehaviorId } from '@/mcp/inputs';
import { runTool } from '@/mcp/tool-result';
import { submitTests } from '@/shell/testing/submit-tests';
import type { ServerContext } from '@/mcp/server-context';

export function registerSubmitTests(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'submit_tests',
    {
      title: 'Submit tests',
      description:
        'Declare that your tests cover these behaviors at these versions. Every test must carry its behavior tag in its name, e.g. it(\'[B4] refuses a transfer over the limit\'). Submitting moves a behavior to tested, and after a revision it is how a stale behavior becomes tested again.',
      inputSchema: {
        behaviors: z
          .array(z.object({ id: behaviorIdInput, version: z.number().int().positive().describe('The approved version your tests target') }))
          .min(1),
      },
    },
    (input) =>
      runTool(async () => {
        const requests = input.behaviors.map((behavior) => ({ id: toBehaviorId(behavior.id), version: behavior.version }));
        const behaviors = await submitTests(await context.project(), requests, context.now());
        return { behaviors, nextStep: 'Call run_tests to see whether the implementation passes them' };
      }),
  );
}
