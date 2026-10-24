import path from 'node:path';
import { readClaudeUserSettings, runClaudeSession } from '@/data/claude-cli';
import { listWorktreePaths } from '@/data/git';
import { withRunLock } from '@/data/storage-lock';
import { projectsRoot, repoIndexPath, testerSessionDir } from '@/data/storage-paths';
import { readGuardFile, writeSessionFile } from '@/data/testing-files';
import { buildTesterClaudeArgs, buildTesterSessionFiles, decideGuard, findUnsafeUserSettings } from '@/domain/clients/tester-session';
import { config } from '@/lib/config';
import { ValidationError } from '@/lib/errors';
import { resolveProject } from '@/shell/project/resolve-project';
import { syncWorkspace, testerWorkspaceDir } from '@/shell/testing/sync-workspace';
import type { GuardDecision, Launcher } from '@/domain/clients/types';
import type { Project } from '@/domain/project/types';
import type { SyncReport } from '@/domain/testing/types';

export type TesterLaunch = {
  project: Project;
  workspace: string;
  sync: SyncReport;
  exitCode: number;
};

export type TesterSession = {
  settingsFile: string;
  mcpConfigFile: string;
  workspace: string;
  sync: SyncReport;
};

export async function launchTester(repoPath: string, launcher: Launcher, now: Date): Promise<TesterLaunch> {
  const project = await resolveProject(repoPath, now);
  const session = await prepareTesterSession(project, launcher);
  const exitCode = await runClaudeSession(buildTesterClaudeArgs(session.settingsFile, session.mcpConfigFile), session.workspace);
  return { project, workspace: session.workspace, sync: session.sync, exitCode };
}

export async function prepareTesterSession(project: Project, launcher: Launcher): Promise<TesterSession> {
  const problems = findUnsafeUserSettings(await readClaudeUserSettings());
  if (problems.length > 0) {
    throw new ValidationError(`The tester sandbox cannot be enforced while your Claude Code settings contain ${problems.join('; ')}. Remove it from ${path.join(config.claudeHome, 'settings.json')} and try again.`);
  }

  const sync = await syncWorkspace(project);
  const sessionDir = testerSessionDir(project.dir);
  const settingsFile = path.join(sessionDir, 'settings.json');
  const mcpConfigFile = path.join(sessionDir, 'mcp.json');
  const guardFile = path.join(sessionDir, 'guard.json');
  const files = buildTesterSessionFiles({
    repoRoot: project.repoRoot,
    worktrees: await listWorktreePaths(project.repoRoot),
    privatePaths: [
      projectsRoot(),
      repoIndexPath(),
      path.join(config.claudeHome, 'projects'),
      path.join(config.claudeHome, 'file-history'),
      path.join(config.claudeHome, 'todos'),
    ],
    launcher,
    guardFile,
  });

  await withRunLock(project.dir, async (lock) => {
    await writeSessionFile(project.dir, settingsFile, files.settings, lock);
    await writeSessionFile(project.dir, mcpConfigFile, files.mcpConfig, lock);
    await writeSessionFile(project.dir, guardFile, files.guard, lock);
  });

  return { settingsFile, mcpConfigFile, workspace: testerWorkspaceDir(project), sync };
}

export async function checkTesterToolUse(guardFile: string, hookInput: unknown): Promise<GuardDecision> {
  const guarded = await readGuardFile(guardFile);
  if (guarded === null) {
    return { blocked: true, reason: 'pacties: the tester guard is missing its configuration; restart the session with "pacties tester"' };
  }
  if (typeof hookInput !== 'object' || hookInput === null || !('tool_input' in hookInput)) {
    return { blocked: true, reason: 'pacties: the tester guard received a tool call it could not read, so it was blocked' };
  }
  return decideGuard(hookInput.tool_input, guarded);
}
