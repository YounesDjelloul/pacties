import { randomUUID } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { resolveProject } from '@/shell/project/resolve-project';
import { runWrapper } from '@/shell/wrapper/run-wrapper';
import type { CliIo } from '@/cli/cli-io';
import type { PlannerLaunch } from '@/domain/wrapper/types';

export type WrapperOptions = {
  resume?: string | boolean;
  continue?: boolean;
};

export async function wrapperCommand(io: CliIo, repoPath: string, options: WrapperOptions, help: string): Promise<number> {
  if (!io.isInteractive) {
    io.out(help);
    return 0;
  }
  if (options.resume !== undefined && options.continue === true) {
    throw new ValidationError('Use either --resume or --continue, not both');
  }
  const project = await resolveProject(repoPath, io.now());
  return runWrapper(project, io.selfLauncher, io.terminal(), io.now, launchFrom(options));
}

function launchFrom(options: WrapperOptions): PlannerLaunch {
  if (options.continue === true) {
    return { kind: 'continue' };
  }
  if (typeof options.resume === 'string') {
    return { kind: 'resume', sessionId: options.resume };
  }
  return options.resume === true ? { kind: 'pick' } : { kind: 'new', sessionId: randomUUID() };
}
