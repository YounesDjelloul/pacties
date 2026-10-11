import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPlannerGetBehavior, registerTesterGetBehavior } from '@/mcp/tools/get-behavior';
import { registerPlannerGetDelta, registerTesterGetDelta } from '@/mcp/tools/get-delta';
import { registerPlannerListBehaviors, registerTesterListBehaviors } from '@/mcp/tools/list-behaviors';
import { registerProposeBehavior } from '@/mcp/tools/propose-behavior';
import { registerUpdateBehavior } from '@/mcp/tools/update-behavior';
import { resolveProject } from '@/shell/project/resolve-project';
import type { ServerContext } from '@/mcp/server-context';
import type { Role } from '@/domain/ledger/types';

const SERVER_VERSION = '0.1.0';

const PLANNER_INSTRUCTIONS = [
  'You are the planner/implementer in a pacties project.',
  'Agree each behavior with the developer, then record it with propose_behavior: a one-line description of observable behavior and the contract tests can rely on.',
  'Only the developer can approve, by running "pacties approve <id>"; never claim a behavior is approved before get_delta or list_behaviors says so.',
  'Call get_delta at the start of every turn to learn approvals, rejections and changes.',
  'If tests fail because the contract itself is wrong, change it with update_behavior instead of coding around it.',
].join(' ');

const TESTER_INSTRUCTIONS = [
  'You are the tester in a pacties project.',
  'Write tests only from approved behaviors and their contracts; do not read or infer the implementation.',
  'Call get_delta at the start of every turn and update existing tests for revised behaviors instead of rewriting them.',
].join(' ');

export function createPactiesServer(role: Role, context: ServerContext): McpServer {
  const server = new McpServer(
    { name: `pacties-${role}`, version: SERVER_VERSION },
    { instructions: role === 'planner' ? PLANNER_INSTRUCTIONS : TESTER_INSTRUCTIONS },
  );

  if (role === 'planner') {
    registerProposeBehavior(server, context);
    registerUpdateBehavior(server, context);
    registerPlannerListBehaviors(server, context);
    registerPlannerGetBehavior(server, context);
    registerPlannerGetDelta(server, context);
  } else {
    registerTesterListBehaviors(server, context);
    registerTesterGetBehavior(server, context);
    registerTesterGetDelta(server, context);
  }

  return server;
}

export async function startMcpServer(role: Role, repoPath: string): Promise<void> {
  const project = await resolveProject(repoPath, new Date());
  const server = createPactiesServer(role, { project, now: () => new Date() });
  await server.connect(new StdioServerTransport());
}
