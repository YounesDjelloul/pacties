import { readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { cursorsSchema } from '@/data/schemas';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { cursorsPath } from '@/data/storage-paths';
import { INITIAL_CURSORS } from '@/domain/ledger/cursors';
import type { Cursors } from '@/domain/ledger/types';

export async function readCursors(projectDir: string): Promise<Cursors> {
  return (await readJsonFile(cursorsPath(projectDir), cursorsSchema)) ?? INITIAL_CURSORS;
}

export async function writeCursors(projectDir: string, cursors: Cursors, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  await writeJsonFileAtomically(cursorsPath(projectDir), cursors);
}
