import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitFacts } from '@/domain/project/types';

const run = promisify(execFile);

export async function readGitFacts(repoPath: string): Promise<GitFacts | null> {
  const commonDir = await git(repoPath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (commonDir === null) {
    return null;
  }
  const rootCommits = await git(repoPath, ['rev-list', '--max-parents=0', 'HEAD']);
  return {
    commonDir: await fs.realpath(path.resolve(repoPath, commonDir.trim())),
    rootCommits: rootCommits === null ? [] : rootCommits.split('\n'),
  };
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd, encoding: 'utf8' });
    return stdout;
  } catch {
    return null;
  }
}

export async function readRepoRoot(repoPath: string): Promise<string | null> {
  const topLevel = await git(repoPath, ['rev-parse', '--show-toplevel']);
  return topLevel === null ? null : fs.realpath(topLevel.trim());
}
