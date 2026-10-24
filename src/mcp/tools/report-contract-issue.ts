import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { behaviorIdInput, toBehaviorId } from '@/mcp/inputs';
import { runTool } from '@/mcp/tool-result';
import { reportContractIssue } from '@/shell/testing/report-contract-issue';
import type { ServerContext } from '@/mcp/server-context';

export function registerReportContractIssue(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'report_contract_issue',
    {
      title: 'Report contract issue',
      description:
        'Tell the planner that a contract is ambiguous, contradictory or missing something your tests need, such as a signature, an error shape or a collaborator to stub. Describe the problem in terms of the contract, not the implementation. The issue closes when the developer approves a revised version.',
      inputSchema: {
        id: behaviorIdInput,
        version: z.number().int().positive().describe('The approved version you read'),
        problem: z.string().describe('What is unclear or missing in the contract'),
      },
    },
    (input) =>
      runTool(async () => {
        const behavior = await reportContractIssue(await context.project(), { id: toBehaviorId(input.id), version: input.version, problem: input.problem }, context.now());
        return { behavior, nextStep: 'Keep testing the parts of the contract that are clear; get_delta shows the revision once it is approved' };
      }),
  );
}
