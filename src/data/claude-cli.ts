import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '@/lib/config';
import { isMissingFile } from '@/data/json-files';
import { InternalError } from '@/lib/errors';
import type { StdioServerEntry } from '@/domain/clients/types';

const run = promisify(execFile);

export async function replaceClaudeLocalServer(repoRoot: string, name: string, entry: StdioServerEntry): Promise<void> {
  await run(config.claudeBin, ['mcp', 'remove', '--scope', 'local', name], { cwd: repoRoot }).catch(() => undefined);
  try {
    await run(config.claudeBin, ['mcp', 'add-json', '--scope', 'local', name, JSON.stringify(entry)], { cwd: repoRoot });
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : String(error);
    throw new InternalError(`"claude mcp add-json ${name}" failed: ${detail}`);
  }
}

export async function removeClaudeLocalServer(repoRoot: string, name: string): Promise<boolean> {
  return run(config.claudeBin, ['mcp', 'remove', '--scope', 'local', name], { cwd: repoRoot }).then(
    () => true,
    () => false,
  );
}

export async function readClaudeUserSettings(): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path.join(config.claudeHome, 'settings.json'), 'utf8')) as unknown;
  } catch (error) {
    if (isMissingFile(error) || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export function runClaudeSession(args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.claudeBin, args, { cwd, stdio: 'inherit' });
    child.on('error', (error) => reject(new InternalError(`Could not start "${config.claudeBin}": ${error.message}`)));
    child.on('close', (code) => resolve(code ?? 1));
  });
}
