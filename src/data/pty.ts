import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import nodePty from 'node-pty';

export type PseudoTerminal = {
  write: (data: string) => void;
  resize: (columns: number, rows: number) => void;
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: (exitCode: number) => void) => void;
  kill: () => void;
};

export function spawnPseudoTerminal(command: string, args: string[], cwd: string, columns: number, rows: number, env: NodeJS.ProcessEnv): PseudoTerminal {
  makeSpawnHelperExecutable();
  const child = nodePty.spawn(command, args, { name: 'xterm-256color', cols: columns, rows, cwd, env: env as Record<string, string> });
  return {
    write: (data) => child.write(data),
    resize: (nextColumns, nextRows) => child.resize(Math.max(1, nextColumns), Math.max(1, nextRows)),
    onData: (listener) => {
      child.onData(listener);
    },
    onExit: (listener) => {
      child.onExit((event) => listener(event.exitCode));
    },
    kill: () => child.kill(),
  };
}

function makeSpawnHelperExecutable(): void {
  const packageDir = path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
  const candidates = [
    path.join(packageDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(packageDir, 'build', 'Release', 'spawn-helper'),
  ];
  for (const helper of candidates) {
    try {
      fs.accessSync(helper, fs.constants.X_OK);
    } catch {
      try {
        fs.chmodSync(helper, 0o755);
      } catch {
        continue;
      }
    }
  }
}
