import fs from 'node:fs/promises';
import { isMissingFile, readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { projectRecordSchema } from '@/data/schemas';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { projectDirFor, projectFilePath, projectsRoot } from '@/data/storage-paths';
import { config } from '@/lib/config';
import type { ProjectRecord } from '@/domain/project/types';

export async function readProjectRecords(): Promise<ProjectRecord[]> {
  const repoIds = await listProjectDirs();
  const records = await Promise.all(repoIds.map((repoId) => readJsonFile(projectFilePath(projectDirFor(repoId)), projectRecordSchema)));
  return records.filter((record): record is ProjectRecord => record !== null);
}

export async function writeProjectRecord(record: ProjectRecord, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, config.pactiesHome);
  await writeJsonFileAtomically(projectFilePath(projectDirFor(record.repoId)), record);
}

async function listProjectDirs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(projectsRoot(), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
}
