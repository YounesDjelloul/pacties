import { createHash } from 'node:crypto';
import path from 'node:path';
import type { GitFacts, KnownProject, RepoIdentity, RepoIndex } from '@/domain/project/types';

const ID_HASH_LENGTH = 12;
const MAX_SLUG_LENGTH = 40;
const FALLBACK_SLUG = 'repo';

export function resolveRepoIdentity(facts: GitFacts, index: RepoIndex, knownProjects: KnownProject[]): RepoIdentity {
  const indexKey = normalizeCommonDir(facts.commonDir);
  const name = repoNameFromCommonDir(indexKey);
  const rootCommit = chooseRootCommit(facts.rootCommits);

  const indexedId = index[indexKey];
  if (indexedId !== undefined) {
    const known = knownProjects.find((project) => project.repoId === indexedId);
    const recordedRoot = known?.rootCommit ?? null;
    return {
      repoId: indexedId,
      indexKey,
      name,
      rootCommit: recordedRoot ?? rootCommit,
      resolution: 'indexed',
      rootCommitLearned: known !== undefined && recordedRoot === null && rootCommit !== null,
    };
  }

  const clone = rootCommit === null ? undefined : knownProjects.find((project) => project.rootCommit === rootCommit);
  if (clone !== undefined) {
    return { repoId: clone.repoId, indexKey, name, rootCommit, resolution: 'matched_clone', rootCommitLearned: false };
  }

  const seed = rootCommit === null ? `path:${indexKey}` : `root:${rootCommit}`;
  return {
    repoId: `${slugify(name)}-${shortHash(seed)}`,
    indexKey,
    name,
    rootCommit,
    resolution: 'new',
    rootCommitLearned: false,
  };
}

function normalizeCommonDir(commonDir: string): string {
  const normalized = path.normalize(commonDir.normalize('NFC'));
  return normalized.length > 1 ? normalized.replace(/[\\/]+$/u, '') : normalized;
}

function repoNameFromCommonDir(commonDir: string): string {
  const base = path.basename(commonDir);
  if (base === '.git') {
    return path.basename(path.dirname(commonDir));
  }
  return base.replace(/\.git$/u, '');
}

function chooseRootCommit(rootCommits: string[]): string | null {
  const commits = rootCommits.map((commit) => commit.trim().toLowerCase()).filter((commit) => commit.length > 0);
  return [...commits].sort()[0] ?? null;
}

function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/u, '');
  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

function shortHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex').slice(0, ID_HASH_LENGTH);
}
