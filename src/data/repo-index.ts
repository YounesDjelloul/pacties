import { readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { repoIndexSchema } from '@/data/schemas';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { repoIndexPath } from '@/data/storage-paths';
import { config } from '@/lib/config';
import type { RepoIndex } from '@/domain/project/types';

export async function readRepoIndex(): Promise<RepoIndex> {
  return (await readJsonFile(repoIndexPath(), repoIndexSchema)) ?? {};
}

export async function writeRepoIndex(index: RepoIndex, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, config.pactiesHome);
  await writeJsonFileAtomically(repoIndexPath(), index);
}
