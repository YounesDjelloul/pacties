import { ROLES } from '@/domain/ledger/constants';
import { SERVER_NAME_PREFIX } from '@/domain/clients/constants';
import type { Launcher, ServerSpec, StdioServerEntry } from '@/domain/clients/types';

export function chooseLauncher(pactiesOnPath: boolean): Launcher {
  return pactiesOnPath ? { command: 'pacties', args: [] } : { command: 'npx', args: ['-y', 'pacties'] };
}

export function buildServerSpecs(launcher: Launcher, repoArgument: string): ServerSpec[] {
  return ROLES.map((role) => ({
    name: `${SERVER_NAME_PREFIX}${role}`,
    command: launcher.command,
    args: [...launcher.args, 'mcp', '--role', role, '--repo', repoArgument],
  }));
}

export function toStdioEntry(spec: ServerSpec): StdioServerEntry {
  return { type: 'stdio', command: spec.command, args: spec.args };
}
