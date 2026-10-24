import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runTool } from '@/mcp/tool-result';
import { runTestsForPlanner, runTestsForTester } from '@/shell/testing/run-tests';
import type { ServerContext } from '@/mcp/server-context';

export function registerPlannerRunTests(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'run_tests',
    {
      title: 'Run tests',
      description:
        "Run the whole test suite in the repository, including the tester's latest tests, and get every result with failure details and the end of the output. Behaviors become passing when all their tagged tests pass. Never edit tests to make them pass: fix the code, or fix the contract with update_behavior if the contract is wrong.",
      inputSchema: {},
    },
    () => runTool(async () => runTestsForPlanner(await context.project(), context.now())),
  );
}

export function registerTesterRunTests(server: McpServer, context: ServerContext): void {
  server.registerTool(
    'run_tests',
    {
      title: 'Run tests',
      description:
        'Copy your tests into the repository and run the whole suite there. You get each test with its status and first assertion line; stack traces, output and anything quoting implementation code are removed. Tests that read files, spawn processes or print function source are refused.',
      inputSchema: {},
    },
    () => runTool(async () => runTestsForTester(await context.project(), context.now())),
  );
}
