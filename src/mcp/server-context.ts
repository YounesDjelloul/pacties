import type { Project } from '@/domain/project/types';

export type ServerContext = {
  project: Project;
  now: () => Date;
};
