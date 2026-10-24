import { SERVER_NAME_PREFIX } from '@/domain/clients/constants';
import type { Launcher, ServerSpec, StdioServerEntry } from '@/domain/clients/types';

export function chooseLauncher(pactiesOnPath: boolean): Launcher {
  return pactiesOnPath ? { command: 'pacties', args: [] } : { command: 'npx', args: ['-y', 'pacties'] };
}

export const PLANNER_SERVER_NAME = `${SERVER_NAME_PREFIX}planner`;

export function buildPlannerServerSpec(launcher: Launcher, repoArgument: string): ServerSpec {
  return {
    name: PLANNER_SERVER_NAME,
    command: launcher.command,
    args: [...launcher.args, 'mcp', '--role', 'planner', '--repo', repoArgument],
  };
}

export function toStdioEntry(spec: ServerSpec): StdioServerEntry {
  return { type: 'stdio', command: spec.command, args: spec.args };
}
