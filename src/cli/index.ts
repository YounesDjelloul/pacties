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
};

const exitCode = await runCli(process.argv.slice(2), io);
if (exitCode !== 0) {
  process.exitCode = exitCode;
}
