import type { Launcher } from '@/domain/clients/types';
import type { WrapperTerminal } from '@/shell/wrapper/types';

export type CliIo = {
  cwd: string;
  isInteractive: boolean;
  out: (text: string) => void;
  err: (text: string) => void;
  confirm: (message: string) => Promise<boolean>;
  chooseMany: (message: string, choices: Choice[]) => Promise<string[]>;
  now: () => Date;
  readStdin: () => Promise<string>;
  selfLauncher: Launcher;
  terminal: () => WrapperTerminal;
};

export type Choice = {
  value: string;
  label: string;
  checked: boolean;
};
