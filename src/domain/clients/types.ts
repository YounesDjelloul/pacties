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
