import { replaceClaudeLocalServer } from '@/data/claude-cli';
import { isCommandAvailable, pathExists } from '@/data/commands';
import { cursorMcpConfigPath, readCursorMcpConfig, writeCursorMcpConfig } from '@/data/cursor-config';
import { CURSOR_WORKSPACE_PLACEHOLDER } from '@/domain/clients/constants';
import { mergeServersIntoMcpConfig } from '@/domain/clients/merge-mcp-config';
import { buildServerSpecs, toStdioEntry } from '@/domain/clients/server-specs';
import { config } from '@/lib/config';
import { ValidationError } from '@/lib/errors';
import type { ClientId, Launcher } from '@/domain/clients/types';

export type ClientAdapter = {
  displayName: string;
  detect: () => Promise<boolean>;
  register: (launcher: Launcher, repoRoot: string) => Promise<string>;
};

export const CLIENT_ADAPTERS: Record<ClientId, ClientAdapter> = {
  'claude-code': {
    displayName: 'Claude Code',
    detect: () => isCommandAvailable(config.claudeBin),
    register: async (launcher, repoRoot) => {
      for (const spec of buildServerSpecs(launcher, repoRoot)) {
        await replaceClaudeLocalServer(repoRoot, spec.name, toStdioEntry(spec));
      }
      return `registered pacties-planner and pacties-tester for ${repoRoot} (local scope, nothing written to the repo)`;
    },
  },
  cursor: {
    displayName: 'Cursor',
    detect: async () => (await pathExists(config.cursorHome)) || (await isCommandAvailable('cursor')),
    register: async (launcher) => {
      const merged = mergeServersIntoMcpConfig(await readCursorMcpConfig(), buildServerSpecs(launcher, CURSOR_WORKSPACE_PLACEHOLDER));
      if (!merged.ok) {
        throw new ValidationError(`${cursorMcpConfigPath()} was left untouched: ${merged.error}`);
      }
      await writeCursorMcpConfig(merged.value);
      return `registered pacties-planner and pacties-tester in ${cursorMcpConfigPath()} (applies to every workspace)`;
    },
  },
};
