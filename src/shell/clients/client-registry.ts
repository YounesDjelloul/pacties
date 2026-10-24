import { removeClaudeLocalServer, replaceClaudeLocalServer } from '@/data/claude-cli';
import { isCommandAvailable, pathExists } from '@/data/commands';
import { cursorMcpConfigPath, readCursorMcpConfig, writeCursorMcpConfig } from '@/data/cursor-config';
import { CURSOR_WORKSPACE_PLACEHOLDER } from '@/domain/clients/constants';
import { mergeServersIntoMcpConfig } from '@/domain/clients/merge-mcp-config';
import { PLANNER_SERVER_NAME, buildPlannerServerSpec, toStdioEntry } from '@/domain/clients/server-specs';
import { TESTER_SERVER_NAME } from '@/domain/clients/tester-session';
import { config } from '@/lib/config';
import { ValidationError } from '@/lib/errors';
import { guardPlannerAgainstTests, releasePlannerFromTestGuard } from '@/shell/clients/planner-guard';
import type { ClientId, Launcher } from '@/domain/clients/types';
import type { Project } from '@/domain/project/types';

export type ClientAdapter = {
  displayName: string;
  detect: () => Promise<boolean>;
  register: (launcher: Launcher, project: Project) => Promise<string>;
  unregister: (project: Project) => Promise<string>;
};

export const CLIENT_ADAPTERS: Record<ClientId, ClientAdapter> = {
  'claude-code': {
    displayName: 'Claude Code',
    detect: () => isCommandAvailable(config.claudeBin),
    register: async (launcher, project) => {
      const spec = buildPlannerServerSpec(launcher, project.repoRoot);
      await replaceClaudeLocalServer(project.repoRoot, spec.name, toStdioEntry(spec));
      const removedTester = await removeClaudeLocalServer(project.repoRoot, TESTER_SERVER_NAME);
      const rules = await guardPlannerAgainstTests(project);
      const cleanup = removedTester ? '; removed the old pacties-tester entry, the tester now runs through "pacties tester"' : '';
      return `registered pacties-planner for ${project.repoRoot} (local scope) and denied the planner ${rules.length} test-file rules in .claude/settings.local.json (git-excluded)${cleanup}`;
    },
    unregister: async (project) => {
      const removedPlanner = await removeClaudeLocalServer(project.repoRoot, PLANNER_SERVER_NAME);
      await removeClaudeLocalServer(project.repoRoot, TESTER_SERVER_NAME);
      const released = await releasePlannerFromTestGuard(project);
      return `${removedPlanner ? 'removed pacties-planner' : 'pacties-planner was not registered'}; lifted ${released} test-file rules`;
    },
  },
  cursor: {
    displayName: 'Cursor',
    detect: async () => (await pathExists(config.cursorHome)) || (await isCommandAvailable('cursor')),
    register: async (launcher) => {
      const merged = mergeServersIntoMcpConfig(await readCursorMcpConfig(), [buildPlannerServerSpec(launcher, CURSOR_WORKSPACE_PLACEHOLDER)]);
      if (!merged.ok) {
        throw new ValidationError(`${cursorMcpConfigPath()} was left untouched: ${merged.error}`);
      }
      await writeCursorMcpConfig(merged.value);
      return `registered pacties-planner in ${cursorMcpConfigPath()} (applies to every workspace; any other pacties entry was removed). Cursor cannot block test edits, so the planner there follows instructions only`;
    },
    unregister: async () => {
      const current = await readCursorMcpConfig();
      if (current === null) {
        return `${cursorMcpConfigPath()} does not exist; nothing to remove`;
      }
      const merged = mergeServersIntoMcpConfig(current, []);
      if (!merged.ok) {
        throw new ValidationError(`${cursorMcpConfigPath()} was left untouched: ${merged.error}`);
      }
      await writeCursorMcpConfig(merged.value);
      return `removed the pacties entries from ${cursorMcpConfigPath()} (every workspace)`;
    },
  },
};
