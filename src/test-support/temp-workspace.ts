import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach } from 'vitest';

const run = promisify(execFile);

export type TempWorkspace = {
  root: string;
  home: string;
};

const ISOLATED_VARIABLES = ['PACTIES_HOME', 'PACTIES_CURSOR_HOME', 'PACTIES_CLAUDE_HOME', 'PACTIES_CLAUDE_BIN'] as const;

export function useTempWorkspace(): () => TempWorkspace {
  let workspace: TempWorkspace | null = null;
  const previous = Object.fromEntries(ISOLATED_VARIABLES.map((name) => [name, process.env[name]]));

  beforeEach(async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pacties ws-')));
    const home = path.join(root, 'pacties home ✦');
    process.env.PACTIES_HOME = home;
    process.env.PACTIES_CURSOR_HOME = path.join(root, 'isolated cursor home');
    process.env.PACTIES_CLAUDE_HOME = path.join(root, 'isolated claude home');
    process.env.PACTIES_CLAUDE_BIN = path.join(root, 'no claude installed', 'claude');
    workspace = { root, home };
  });

  afterEach(async () => {
    for (const name of ISOLATED_VARIABLES) {
      const value = previous[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    if (workspace !== null) {
      await fs.rm(workspace.root, { recursive: true, force: true });
    }
    workspace = null;
  });

  return () => {
    if (workspace === null) {
      throw new Error('temp workspace used outside a test');
    }
    return workspace;
  };
}

export async function createGitRepo(parent: string, name: string, options: { commit: boolean }): Promise<string> {
  const repoPath = path.join(parent, name);
  await fs.mkdir(repoPath, { recursive: true });
  await git(repoPath, 'init', '--quiet');
  if (options.commit) {
    await commitEmpty(repoPath, 'root');
  }
  return repoPath;
}

export async function commitEmpty(repoPath: string, message: string): Promise<void> {
  await git(repoPath, '-c', 'user.name=Zoë Test', '-c', 'user.email=zoe@example.test', 'commit', '--allow-empty', '--quiet', '-m', message);
}

export async function cloneRepo(source: string, destination: string): Promise<string> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await git(path.dirname(destination), 'clone', '--quiet', source, destination);
  return destination;
}

export async function addWorktree(repoPath: string, destination: string): Promise<string> {
  await git(repoPath, 'worktree', 'add', '--quiet', '--detach', destination);
  return destination;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, { cwd });
}

export async function createTempProject(workspace: TempWorkspace, name = 'Zahlungs Dienst é') {
  const { resolveProject } = await import('@/shell/project/resolve-project');
  const repo = await createGitRepo(workspace.root, name, { commit: true });
  return resolveProject(repo, new Date('2026-10-25T00:00:00.000Z'));
}
