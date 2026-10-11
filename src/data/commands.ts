import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PROBE_TIMEOUT_MS = 5_000;

export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    await run(command, ['--version'], { timeout: PROBE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
