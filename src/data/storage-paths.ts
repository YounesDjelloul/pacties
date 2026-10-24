import path from 'node:path';
import { config } from '@/lib/config';

export function projectsRoot(): string {
  return path.join(config.pactiesHome, 'projects');
}

export function projectDirFor(repoId: string): string {
  return path.join(projectsRoot(), repoId);
}

export function eventsPath(projectDir: string): string {
  return path.join(projectDir, 'events.jsonl');
}

export function cursorsPath(projectDir: string): string {
  return path.join(projectDir, 'cursors.json');
}

export function projectFilePath(projectDir: string): string {
  return path.join(projectDir, 'project.json');
}

export function repoIndexPath(): string {
  return path.join(config.pactiesHome, 'repos.json');
}

export function workspacesRoot(): string {
  return path.join(config.pactiesHome, 'workspaces');
}

export function workspaceDirFor(repoId: string): string {
  return path.join(workspacesRoot(), repoId);
}

export function testerPolicyPath(projectDir: string): string {
  return path.join(projectDir, 'tester.json');
}

export function syncManifestPath(projectDir: string): string {
  return path.join(projectDir, 'sync-manifest.json');
}

export function runDirFor(projectDir: string, runId: string): string {
  return path.join(projectDir, 'runs', runId);
}

export function testerSessionDir(projectDir: string): string {
  return path.join(projectDir, 'tester-session');
}
