import fs from 'node:fs/promises';
import { listRepoFiles } from '@/data/git';
import { workspaceDirFor } from '@/data/storage-paths';
import { withRunLock, type StorageLock } from '@/data/storage-lock';
import { readSyncManifest, writeSyncManifest } from '@/data/testing-files';
import { copyRelativeFile, hashFiles, listWorkspaceFiles, readTextFiles, removeRelativeFile } from '@/data/workspace-files';
import { planConflictResolution, planSync } from '@/domain/testing/plan-sync';
import { scanTestSource } from '@/domain/testing/scan-test-source';
import { isMirroredPath } from '@/domain/testing/test-policy';
import { loadTestPolicy } from '@/shell/testing/test-policy';
import type { Project } from '@/domain/project/types';
import { ValidationError } from '@/lib/errors';
import type { ConflictResolution, ConflictSide, SyncReport, SyncSnapshot, TestPolicy } from '@/domain/testing/types';

export async function syncWorkspace(project: Project): Promise<SyncReport> {
  const policy = await loadTestPolicy(project);
  return withRunLock(project.dir, (lock) => syncUnderLock(project, policy, lock));
}

export function testerWorkspaceDir(project: Project): string {
  return workspaceDirFor(project.repoId);
}

export async function syncUnderLock(project: Project, policy: TestPolicy, lock: StorageLock): Promise<SyncReport> {
  const workspace = testerWorkspaceDir(project);
  const snapshot = await readSyncSnapshot(project, policy);
  const base = snapshot.base;
  const plan = planSync(snapshot, policy);
  const refused = scanTestSource(await readTextFiles(workspace, plan.push), { allowFileSystem: policy.allowFileSystem });
  const refusedPaths = new Set(refused.map((use) => use.path));
  const pushed = plan.push.filter((path) => !refusedPaths.has(path));
  const nextBase = { ...plan.base };
  for (const path of refusedPaths) {
    if (path in base) {
      nextBase[path] = base[path]!;
    } else {
      delete nextBase[path];
    }
  }

  for (const path of plan.pull) {
    await copyRelativeFile(project.repoRoot, workspace, path);
  }
  for (const path of plan.deleteFromWorkspace) {
    await removeRelativeFile(workspace, path);
  }
  for (const path of pushed) {
    await copyRelativeFile(workspace, project.repoRoot, path);
  }
  for (const path of plan.deleteFromRepo) {
    await removeRelativeFile(project.repoRoot, path);
  }
  await writeSyncManifest(project.dir, nextBase, lock);

  return {
    pulled: plan.pull,
    pushed,
    deletedFromRepo: plan.deleteFromRepo,
    deletedFromWorkspace: plan.deleteFromWorkspace,
    conflicts: plan.conflicts,
    notPushed: plan.notPushed,
    refused,
  };
}

export async function listConflicts(project: Project): Promise<string[]> {
  const policy = await loadTestPolicy(project);
  return withRunLock(project.dir, async () => planSync(await readSyncSnapshot(project, policy), policy).conflicts);
}

export async function resolveConflict(project: Project, path: string, keep: ConflictSide): Promise<ConflictResolution> {
  const policy = await loadTestPolicy(project);
  const workspace = testerWorkspaceDir(project);

  return withRunLock(project.dir, async (lock) => {
    const snapshot = await readSyncSnapshot(project, policy);
    const resolution = planConflictResolution(path, keep, snapshot, policy);
    if (!resolution.ok) {
      throw new ValidationError(resolution.error);
    }

    if (resolution.value.copyFrom === 'tester') {
      const forbidden = scanTestSource(await readTextFiles(workspace, [path]), { allowFileSystem: policy.allowFileSystem });
      if (forbidden.length > 0) {
        throw new ValidationError(`The tester's ${path} ${forbidden[0]!.rule} (line ${forbidden[0]!.line}), so it cannot be copied into the repo; keep the repo version instead`);
      }
      await copyRelativeFile(workspace, project.repoRoot, path);
    } else if (resolution.value.copyFrom === 'repo') {
      await copyRelativeFile(project.repoRoot, workspace, path);
    }
    if (resolution.value.removeFrom === 'tester') {
      await removeRelativeFile(workspace, path);
    } else if (resolution.value.removeFrom === 'repo') {
      await removeRelativeFile(project.repoRoot, path);
    }

    const others = Object.fromEntries(Object.entries(snapshot.base).filter(([basePath]) => basePath !== path));
    const base = resolution.value.baseHash === null ? others : { ...others, [path]: resolution.value.baseHash };
    await writeSyncManifest(project.dir, base, lock);
    return resolution.value;
  });
}

async function readSyncSnapshot(project: Project, policy: TestPolicy): Promise<SyncSnapshot> {
  const workspace = testerWorkspaceDir(project);
  await fs.mkdir(workspace, { recursive: true });
  const repoPaths = (await listRepoFiles(project.repoRoot)).filter((path) => isMirroredPath(path, policy));
  const [repo, workspaceHashes, base] = await Promise.all([
    hashFiles(project.repoRoot, repoPaths),
    listWorkspaceFiles(workspace).then((paths) => hashFiles(workspace, paths)),
    readSyncManifest(project.dir),
  ]);
  return { repo, workspace: workspaceHashes, base };
}
