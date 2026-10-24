import { isMirroredPath, isTestPath } from '@/domain/testing/test-policy';
import type { FileHashes, SyncPlan, SyncSnapshot, TestPolicy } from '@/domain/testing/types';

export function planSync(snapshot: SyncSnapshot, policy: TestPolicy): SyncPlan {
  const plan: SyncPlan = { pull: [], push: [], deleteFromWorkspace: [], deleteFromRepo: [], conflicts: [], notPushed: [], base: {} };
  const paths = [...new Set([...Object.keys(snapshot.repo), ...Object.keys(snapshot.workspace), ...Object.keys(snapshot.base)])].sort();

  for (const path of paths) {
    if (!isMirroredPath(path, policy)) {
      if (path in snapshot.workspace) {
        plan.notPushed.push(path);
      }
      continue;
    }
    planPath(path, snapshot, isTestPath(path, policy), plan);
  }

  return plan;
}

function planPath(path: string, snapshot: SyncSnapshot, pushable: boolean, plan: SyncPlan): void {
  const repo = snapshot.repo[path];
  const workspace = snapshot.workspace[path];
  const base = snapshot.base[path];
  const repoChanged = repo !== base;
  const workspaceChanged = workspace !== base;

  if (repo === workspace) {
    keep(plan.base, path, repo);
    return;
  }

  if (!workspaceChanged) {
    if (repo === undefined) {
      plan.deleteFromWorkspace.push(path);
    } else {
      plan.pull.push(path);
    }
    keep(plan.base, path, repo);
    return;
  }

  if (!pushable) {
    plan.notPushed.push(path);
    keep(plan.base, path, base);
    return;
  }

  if (!repoChanged) {
    if (workspace === undefined) {
      plan.deleteFromRepo.push(path);
    } else {
      plan.push.push(path);
    }
    keep(plan.base, path, workspace);
    return;
  }

  plan.conflicts.push(path);
  keep(plan.base, path, base);
}

function keep(base: FileHashes, path: string, hash: string | undefined): void {
  if (hash !== undefined) {
    base[path] = hash;
  }
}
