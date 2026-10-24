import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { config } from '@/lib/config';

const STDERR_TAIL_CHARS = 2_000;

export type JobExit = {
  exitCode: number | null;
  stderrTail: string;
};

export function runClaudeJob(args: string[], cwd: string, onLine: (line: string) => void, signal: AbortSignal): Promise<JobExit> {
  return new Promise((resolve) => {
    const child = spawn(config.claudeBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], signal, killSignal: 'SIGTERM' });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL_CHARS);
    });
    createInterface({ input: child.stdout }).on('line', onLine);
    child.on('error', (error) => resolve({ exitCode: null, stderrTail: signal.aborted ? 'stopped because pacties quit' : error.message }));
    child.on('close', (exitCode) => resolve({ exitCode, stderrTail: stderr.trim() }));
  });
}
