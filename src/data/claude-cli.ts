import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '@/lib/config';
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
