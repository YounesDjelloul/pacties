export type CliIo = {
  cwd: string;
  isInteractive: boolean;
  out: (text: string) => void;
  err: (text: string) => void;
  confirm: (message: string) => Promise<boolean>;
  chooseMany: (message: string, choices: Choice[]) => Promise<string[]>;
  now: () => Date;
};

export type Choice = {
  value: string;
  label: string;
  checked: boolean;
};
