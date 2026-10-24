import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_CAPTURED_CHARS = 200_000;
const RUN_TIMEOUT_MS = 15 * 60 * 1000;

export type CommandOutcome = {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
};

export async function runShellCommand(command: string, cwd: string, reportPath: string): Promise<CommandOutcome> {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const capture = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-MAX_CAPTURED_CHARS);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, RUN_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, output: `${output}\n${error.message}`, timedOut });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output, timedOut });
    });
  });
}
