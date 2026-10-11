import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProject } from '@/shell/project/resolve-project';
import { ValidationError } from '@/lib/errors';
import { addWorktree, cloneRepo, commitEmpty, createGitRepo, useTempWorkspace } from '@/test-support/temp-workspace';

const NOW = new Date('2026-10-25T01:30:00.250Z');

describe('resolveProject', () => {
  const workspace = useTempWorkspace();

  it('creates a project folder, index entry and project record for a new repository', async () => {
    const repo = await createGitRepo(workspace().root, 'Payments API (Zoë)', { commit: true });
    const project = await resolveProject(repo, NOW);

    expect(project.repoId).toMatch(/^payments-api-zoe-[0-9a-f]{12}$/u);
    expect(project.dir).toBe(path.join(workspace().home, 'projects', project.repoId));
    const record = JSON.parse(await fs.readFile(path.join(project.dir, 'project.json'), 'utf8'));
    expect(record).toMatchObject({ repoId: project.repoId, name: 'Payments API (Zoë)', createdAt: NOW.toISOString() });
    expect(record.rootCommit).toMatch(/^[0-9a-f]{40}$/u);
  });

  it('resolves the same project from a subdirectory of the repository', async () => {
    const repo = await createGitRepo(workspace().root, 'ledger svc', { commit: true });
    await fs.mkdir(path.join(repo, 'src', 'deep dir'), { recursive: true });
    const fromRoot = await resolveProject(repo, NOW);
    const fromSubdir = await resolveProject(path.join(repo, 'src', 'deep dir'), NOW);
    expect(fromSubdir.repoId).toBe(fromRoot.repoId);
  });

  it('keeps the id of a repository first seen without commits and records the root commit later', async () => {
    const repo = await createGitRepo(workspace().root, 'fresh repo', { commit: false });
    const before = await resolveProject(repo, NOW);
    await commitEmpty(repo, 'first');
    const after = await resolveProject(repo, new Date('2026-10-26T09:00:00Z'));

    expect(after.repoId).toBe(before.repoId);
    expect(before.rootCommit).toBeNull();
    const record = JSON.parse(await fs.readFile(path.join(after.dir, 'project.json'), 'utf8'));
    expect([record.rootCommit, record.createdAt]).toEqual([after.rootCommit, NOW.toISOString()]);
    expect(after.rootCommit).toMatch(/^[0-9a-f]{40}$/u);
  });

  it('shares one project between a repository and its clone', async () => {
    const original = await createGitRepo(workspace().root, 'origin repo', { commit: true });
    const first = await resolveProject(original, NOW);
    const clone = await cloneRepo(original, path.join(workspace().root, 'clones', 'my clone'));
    expect((await resolveProject(clone, NOW)).repoId).toBe(first.repoId);
  });

  it('shares one project between a repository and its worktree', async () => {
    const repo = await createGitRepo(workspace().root, 'main checkout', { commit: true });
    const first = await resolveProject(repo, NOW);
    const worktree = await addWorktree(repo, path.join(workspace().root, 'feature wt'));
    expect((await resolveProject(worktree, NOW)).repoId).toBe(first.repoId);
  });

  it('rejects a folder that is not inside a git repository', async () => {
    const folder = path.join(workspace().root, 'not a repo');
    await fs.mkdir(folder);
    await expect(resolveProject(folder, NOW)).rejects.toBeInstanceOf(ValidationError);
  });
});
