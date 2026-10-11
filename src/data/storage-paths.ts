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
