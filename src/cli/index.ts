import fs from 'node:fs';
import { checkbox, confirm } from '@inquirer/prompts';
import { runCli } from '@/cli/program';
import type { CliIo } from '@/cli/cli-io';

const io: CliIo = {
  cwd: process.cwd(),
  isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  confirm: (message) => confirm({ message, default: false }),
  chooseMany: (message, choices) => checkbox({ message, choices: choices.map((choice) => ({ value: choice.value, name: choice.label, checked: choice.checked })) }),
  now: () => new Date(),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks).toString('utf8');
  },
  selfLauncher: { command: process.execPath, args: [fs.realpathSync(process.argv[1] ?? '')] },
};

const exitCode = await runCli(process.argv.slice(2), io);
if (exitCode !== 0) {
  process.exitCode = exitCode;
}
