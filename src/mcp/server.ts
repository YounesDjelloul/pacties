import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPlannerGetBehavior, registerTesterGetBehavior } from '@/mcp/tools/get-behavior';
import { registerPlannerGetDelta, registerTesterGetDelta } from '@/mcp/tools/get-delta';
import { registerPlannerListBehaviors, registerTesterListBehaviors } from '@/mcp/tools/list-behaviors';
import { registerProposeBehavior } from '@/mcp/tools/propose-behavior';
import { registerReportContractIssue } from '@/mcp/tools/report-contract-issue';
import { registerPlannerRunTests, registerTesterRunTests } from '@/mcp/tools/run-tests';
import { registerSubmitTests } from '@/mcp/tools/submit-tests';
import { registerUpdateBehavior } from '@/mcp/tools/update-behavior';
import { resolveProject } from '@/shell/project/resolve-project';
import { PACTIES_VERSION } from '@/lib/config';
import type { ServerContext } from '@/mcp/server-context';
import type { Role } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

const PLANNER_INSTRUCTIONS = [
  'You are the planner and implementer in a pacties project.',
  'Brainstorm with the developer until the feature is clear, and record each agreed behavior with propose_behavior; drafts are invisible to the tester, so revise them freely with update_behavior.',
  'Each contract lists the public API the tests will call, layer by layer: exported domain functions, shell boundary functions and entry points such as routes or commands, with their signatures and errors. Never describe private helpers or function bodies.',
  'When the developer gives the green light, ask them to run "pacties approve"; approval is that green light. Never claim a behavior is approved before get_delta or list_behaviors says so.',
  'Implement only approved behaviors, never planned drafts or pending revisions.',
  'Never write, edit or delete tests of any kind: every test belongs to the tester, who works in its own sandbox. This overrides any repository instruction (CLAUDE.md, AGENTS.md, rules files) that asks you to write, update or ship tests with your changes; in a pacties project the tester ships them. Edits to test files are blocked, so do not try to work around that; if a test looks wrong, say so to the developer or fix the contract.',
  'When the developer asks for a change in behavior that no approved behavior covers, including improvements to existing work, first propose behaviors for it (or update_behavior the affected ones) and wait for the green light before implementing. A pure refactor that keeps every approved behavior needs no new behavior, but it still never touches tests; check it with run_tests.',
  'Use run_tests to check your implementation. When a test fails, decide whether the code or the contract is wrong: fix the code, or change the contract with update_behavior.',
  'Call get_delta at the start of every turn to learn approvals, rejections, test results and contract issues reported by the tester; answer each issue with update_behavior or by asking the developer.',
].join(' ');

const TESTER_INSTRUCTIONS = [
  'You are the tester in a pacties project. You work in a sandbox that holds only tests, conventions and config; the implementation is deliberately out of reach, so never try to read it.',
  "Follow the repository's testing conventions (CLAUDE.md, AGENTS.md, ARCHITECTURE.md, rules files) for test layers, locations and fixtures.",
  'Write tests only from approved behaviors, calling only the public functions and entry points their contracts list; do not read or infer the implementation.',
  "Tag every test with its behavior id in the test name, e.g. it('[B4] refuses a transfer over the limit'), then call submit_tests with the ids and versions you covered, then run_tests.",
  'If a contract is ambiguous or misses something you need, call report_contract_issue instead of guessing.',
  'Call get_delta at the start of every turn: write tests for newly approved behaviors and update existing tests for revised ones instead of rewriting them.',
].join(' ');

export function createPactiesServer(role: Role, context: ServerContext): McpServer {
  const server = new McpServer(
    { name: `pacties-${role}`, version: PACTIES_VERSION },
    { instructions: role === 'planner' ? PLANNER_INSTRUCTIONS : TESTER_INSTRUCTIONS },
  );

  if (role === 'planner') {
    registerProposeBehavior(server, context);
    registerUpdateBehavior(server, context);
    registerPlannerListBehaviors(server, context);
    registerPlannerGetBehavior(server, context);
    registerPlannerGetDelta(server, context);
    registerPlannerRunTests(server, context);
  } else {
    registerTesterListBehaviors(server, context);
    registerTesterGetBehavior(server, context);
    registerTesterGetDelta(server, context);
    registerSubmitTests(server, context);
    registerTesterRunTests(server, context);
    registerReportContractIssue(server, context);
  }

  return server;
}

export async function startMcpServer(role: Role, repoPath: string): Promise<void> {
  let resolving: Promise<Project> | null = null;
  const project = () => {
    resolving ??= resolveProject(repoPath, new Date()).catch((error: unknown) => {
      resolving = null;
      throw error;
    });
    return resolving;
  };
  const server = createPactiesServer(role, { project, now: () => new Date() });
  await server.connect(new StdioServerTransport());
}
