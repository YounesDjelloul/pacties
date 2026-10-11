import os from 'node:os';
import path from 'node:path';

export const config = {
  get pactiesHome(): string {
    return process.env.PACTIES_HOME ?? path.join(os.homedir(), '.pacties');
  },
};
