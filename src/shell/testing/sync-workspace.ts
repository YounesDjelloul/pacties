import fs from 'node:fs/promises';
import { listRepoFiles } from '@/data/git';
import { workspaceDirFor } from '@/data/storage-paths';
import { withRunLock, type StorageLock } from '@/data/storage-lock';
import { readSyncManifest, writeSyncManifest } from '@/data/testing-files';
import { copyRelativeFile, hashFiles, listWorkspaceFiles, readTextFiles, removeRelativeFile } from '@/data/workspace-files';
import { planSync } from '@/domain/testing/plan-sync';
import { scanTestSource } from '@/domain/testing/scan-test-source';
import { isMirroredPath } from '@/domain/testing/test-policy';
import { loadTestPolicy } from '@/shell/testing/test-policy';
import type { Project } from '@/domain/project/types';
import type { SyncReport, TestPolicy } from '@/domain/testing/types';

export async function syncWorkspace(project: Project): Promise<SyncReport> {
  const policy = await loadTestPolicy(project);
  return withRunLock(project.dir, (lock) => syncUnderLock(project, policy, lock));
}

export function testerWorkspaceDir(project: Project): string {
  return workspaceDirFor(project.repoId);
}

export async function syncUnderLock(project: Project, policy: TestPolicy, lock: StorageLock): Promise<SyncReport> {
  const workspace = testerWorkspaceDir(project);
  await fs.mkdir(workspace, { recursive: true });

  const repoPaths = (await listRepoFiles(project.repoRoot)).filter((path) => isMirroredPath(path, policy));
  const [repo, workspaceHashes, base] = await Promise.all([
    hashFiles(project.repoRoot, repoPaths),
    listWorkspaceFiles(workspace).then((paths) => hashFiles(workspace, paths)),
    readSyncManifest(project.dir),
  ]);

  const plan = planSync({ repo, workspace: workspaceHashes, base }, policy);
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
