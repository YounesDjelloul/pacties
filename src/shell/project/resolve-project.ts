import fs from 'node:fs/promises';
import { readGitFacts, readRepoRoot } from '@/data/git';
import { readProjectRecords, writeProjectRecord } from '@/data/project-files';
import { readRepoIndex, writeRepoIndex } from '@/data/repo-index';
import { withHomeLock } from '@/data/storage-lock';
import { projectDirFor } from '@/data/storage-paths';
import { resolveRepoIdentity } from '@/domain/project/resolve-repo-identity';
import { ValidationError } from '@/lib/errors';
import type { Project, ProjectRecord } from '@/domain/project/types';

export async function resolveProject(repoPath: string, now: Date): Promise<Project> {
  const [facts, repoRoot] = await Promise.all([readGitFacts(repoPath), readRepoRoot(repoPath)]);
  if (facts === null) {
    throw new ValidationError(`pacties needs a git repository, but ${repoPath} is not inside one; run "git init" there first`);
  }

  return withHomeLock(async (lock) => {
    const [index, records] = await Promise.all([readRepoIndex(), readProjectRecords()]);
    const identity = resolveRepoIdentity(facts, index, records);
    const existing = records.find((record) => record.repoId === identity.repoId);

    if (identity.resolution !== 'indexed') {
      await writeRepoIndex({ ...index, [identity.indexKey]: identity.repoId }, lock);
    }

    if (existing === undefined || identity.rootCommitLearned) {
      const record: ProjectRecord = {
        repoId: identity.repoId,
        name: existing?.name ?? identity.name,
        rootCommit: identity.rootCommit,
        createdAt: existing?.createdAt ?? now.toISOString(),
      };
      await writeProjectRecord(record, lock);
    }

    const dir = projectDirFor(identity.repoId);
    await fs.mkdir(dir, { recursive: true });
    return {
      repoId: identity.repoId,
      name: existing?.name ?? identity.name,
      dir,
      rootCommit: identity.rootCommit,
      repoRoot: repoRoot ?? facts.commonDir,
    };
  });
}
