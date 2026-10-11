import type { Project } from '@/domain/project/types';

export type ServerContext = {
  project: () => Promise<Project>;
  now: () => Date;
};
