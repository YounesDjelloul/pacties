import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { isMissingFile, readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { runDirFor, syncManifestPath, testerPolicyPath } from '@/data/storage-paths';
import type { FileHashes, PackageManifest, TestPolicy } from '@/domain/testing/types';

const testPolicySchema = z.object({
  include: z.array(z.string()).min(1),
  testCommand: z.string().min(1),
  allowFileSystem: z.boolean().default(false),
});

const fileHashesSchema = z.record(z.string(), z.string());

const packageManifestSchema = z.looseObject({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

export function readTestPolicy(projectDir: string): Promise<TestPolicy | null> {
  return readJsonFile(testerPolicyPath(projectDir), testPolicySchema);
}

export async function writeTestPolicy(projectDir: string, policy: TestPolicy, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  await writeJsonFileAtomically(testerPolicyPath(projectDir), policy);
}

export async function readSyncManifest(projectDir: string): Promise<FileHashes> {
  return (await readJsonFile(syncManifestPath(projectDir), fileHashesSchema)) ?? {};
}

export async function writeSyncManifest(projectDir: string, hashes: FileHashes, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  await writeJsonFileAtomically(syncManifestPath(projectDir), hashes);
}

export async function readPackageManifest(repoRoot: string): Promise<PackageManifest | null> {
  try {
    const parsed = packageManifestSchema.safeParse(JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (isMissingFile(error) || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export async function writeRunRecord(projectDir: string, runId: string, record: unknown, lock: StorageLock): Promise<string> {
  assertLockHeld(lock, projectDir);
  const dir = runDirFor(projectDir, runId);
  await writeJsonFileAtomically(path.join(dir, 'run.json'), record);
  return dir;
}

export function junitReportPath(projectDir: string, runId: string): string {
  return path.join(runDirFor(projectDir, runId), 'junit.xml');
}

export async function readJunitReport(projectDir: string, runId: string): Promise<string | null> {
  try {
    return await fs.readFile(junitReportPath(projectDir, runId), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

export async function writeSessionFile(projectDir: string, filePath: string, value: unknown, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  await writeJsonFileAtomically(filePath, value);
}

export async function readGuardFile(filePath: string): Promise<string[] | null> {
  const guard = await readJsonFile(filePath, z.object({ guarded: z.array(z.string()) }));
  return guard?.guarded ?? null;
}

const sessionPairsSchema = z.record(z.string(), z.string());

export async function readSessionPairs(projectDir: string): Promise<Record<string, string>> {
  return (await readJsonFile(path.join(projectDir, 'session-pairs.json'), sessionPairsSchema)) ?? {};
}

export async function writeSessionPairs(projectDir: string, pairs: Record<string, string>, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  await writeJsonFileAtomically(path.join(projectDir, 'session-pairs.json'), pairs);
}
