import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { gitPath } from '@/data/git';
import { isMissingFile, readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { LOCAL_SETTINGS_RELATIVE_PATH } from '@/domain/clients/planner-guard';

const guardRecordSchema = z.object({ rules: z.array(z.string()) });

export function localSettingsPath(repoRoot: string): string {
  return path.join(repoRoot, LOCAL_SETTINGS_RELATIVE_PATH);
}

export function readLocalSettings(repoRoot: string): Promise<unknown> {
  return readJsonFile(localSettingsPath(repoRoot), z.unknown());
}

export async function writeLocalSettings(repoRoot: string, settings: unknown): Promise<void> {
  await writeJsonFileAtomically(localSettingsPath(repoRoot), settings);
}

export async function readGitExclude(repoRoot: string): Promise<{ filePath: string; content: string } | null> {
  const filePath = await gitPath(repoRoot, 'info/exclude');
  if (filePath === null) {
    return null;
  }
  try {
    return { filePath, content: await fs.readFile(filePath, 'utf8') };
  } catch (error) {
    if (isMissingFile(error)) {
      return { filePath, content: '' };
    }
    throw error;
  }
}

export async function writeGitExclude(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

export async function readGuardRecord(projectDir: string): Promise<string[]> {
  return (await readJsonFile(path.join(projectDir, 'planner-guard.json'), guardRecordSchema))?.rules ?? [];
}

export async function writeGuardRecord(projectDir: string, rules: string[], lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  await writeJsonFileAtomically(path.join(projectDir, 'planner-guard.json'), { rules });
}
