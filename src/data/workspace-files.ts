import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isMissingFile } from '@/data/json-files';
import { InternalError } from '@/lib/errors';
import type { FileHashes, SourceFile } from '@/domain/testing/types';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage']);
const MAX_TEXT_FILE_BYTES = 1_000_000;

export async function listWorkspaceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  await walk(root, '', found);
  return found.sort();
}

export async function hashFiles(root: string, relativePaths: string[]): Promise<FileHashes> {
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const content = await readRegularFile(root, relativePath);
      return content === null ? null : ([relativePath, createHash('sha256').update(content).digest('hex')] as const);
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export async function copyRelativeFile(fromRoot: string, toRoot: string, relativePath: string): Promise<void> {
  const content = await readRegularFile(fromRoot, relativePath);
  if (content === null) {
    return;
  }
  const destination = await safeDestination(toRoot, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(destination, { force: true });
  await fs.writeFile(destination, content);
}

export async function removeRelativeFile(root: string, relativePath: string): Promise<void> {
  const destination = await safeDestination(root, relativePath);
  await fs.rm(destination, { force: true });
}

export async function readTextFiles(root: string, relativePaths: string[]): Promise<SourceFile[]> {
  const files = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const content = await readRegularFile(root, relativePath);
      if (content === null || content.length > MAX_TEXT_FILE_BYTES || content.includes(0)) {
        return null;
      }
      return { path: relativePath, content: content.toString('utf8') };
    }),
  );
  return files.filter((file) => file !== null);
}

async function walk(root: string, relativeDir: string, found: string[]): Promise<void> {
  const entries = await fs.readdir(path.join(root, relativeDir), { withFileTypes: true }).catch((error: unknown) => {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  });
  for (const entry of entries) {
    const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
      await walk(root, relativePath, found);
    } else if (entry.isFile()) {
      found.push(relativePath);
    }
  }
}

async function readRegularFile(root: string, relativePath: string): Promise<Buffer | null> {
  const absolute = path.join(root, relativePath);
  const stat = await fs.lstat(absolute).catch((error: unknown) => {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  });
  if (stat === null || !stat.isFile()) {
    return null;
  }
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(absolute)]);
  if (!isInside(realRoot, realFile)) {
    return null;
  }
  return fs.readFile(absolute);
}

async function safeDestination(root: string, relativePath: string): Promise<string> {
  const destination = path.resolve(root, relativePath);
  if (!isInside(path.resolve(root), destination)) {
    throw new InternalError(`Refused to write outside ${root}`);
  }
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  let parent = path.dirname(destination);
  while (isInside(path.resolve(root), parent)) {
    const stat = await fs.lstat(parent).catch(() => null);
    if (stat !== null) {
      if (stat.isSymbolicLink() || !isInside(realRoot, await fs.realpath(parent))) {
        throw new InternalError(`Refused to write through a symbolic link under ${root}`);
      }
      break;
    }
    parent = path.dirname(parent);
  }
  return destination;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
