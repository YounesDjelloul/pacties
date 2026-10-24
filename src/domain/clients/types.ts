import type { CLIENT_IDS } from '@/domain/clients/constants';

export type ClientId = (typeof CLIENT_IDS)[number];

export type ServerSpec = {
  name: string;
  command: string;
  args: string[];
};

export type Launcher = {
  command: string;
  args: string[];
};

export type StdioServerEntry = {
  type: 'stdio';
  command: string;
  args: string[];
};

export type TesterSessionInput = {
  repoRoot: string;
  worktrees: string[];
  privatePaths: string[];
  launcher: Launcher;
  guardFile: string;
};

export type TesterSessionFiles = {
  settings: Record<string, unknown>;
  mcpConfig: Record<string, unknown>;
  guard: { guarded: string[] };
};

export type GuardDecision = {
  blocked: boolean;
  reason: string | null;
};
