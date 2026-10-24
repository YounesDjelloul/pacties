import type { CliIo, Choice } from '@/cli/cli-io';

export type FakeCliIo = CliIo & {
  output: () => string;
  errors: () => string;
  prompts: string[];
};

export function fakeCliIo(
  cwd: string,
  options: { interactive: boolean; answer?: boolean; choose?: (choices: Choice[]) => string[]; stdin?: string },
): FakeCliIo {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  return {
    cwd,
    isInteractive: options.interactive,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    confirm: async (message) => {
      prompts.push(message);
      return options.answer ?? false;
    },
    chooseMany: async (message, choices) => {
      prompts.push(message);
      return options.choose?.(choices) ?? choices.filter((choice) => choice.checked).map((choice) => choice.value);
    },
    now: () => new Date('2026-10-25T01:59:59.500Z'),
    readStdin: async () => options.stdin ?? '',
    selfLauncher: { command: '/opt/node 26/bin/node', args: ['/opt/pacties é/dist/cli/index.js'] },
    terminal: () => {
      throw new Error('fake CLI io has no terminal');
    },
    output: () => out.join('\n'),
    errors: () => err.join('\n'),
    prompts,
  };
}
