import os from 'node:os';
import path from 'node:path';

export const PACTIES_VERSION = '0.1.0';

export const config = {
  get pactiesHome(): string {
    return process.env.PACTIES_HOME ?? path.join(os.homedir(), '.pacties');
  },
  get cursorHome(): string {
    return process.env.PACTIES_CURSOR_HOME ?? path.join(os.homedir(), '.cursor');
  },
  get claudeBin(): string {
    return process.env.PACTIES_CLAUDE_BIN ?? 'claude';
  },
};
