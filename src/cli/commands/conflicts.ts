import { requireDeveloperTerminal } from '@/cli/require-developer';
import { ValidationError } from '@/lib/errors';
import { resolveProject } from '@/shell/project/resolve-project';
import { listConflicts, resolveConflict } from '@/shell/testing/sync-workspace';
import type { CliIo } from '@/cli/cli-io';
import type { ConflictSide } from '@/domain/testing/types';

const SIDES: ConflictSide[] = ['repo', 'tester'];

export async function conflictsCommand(io: CliIo, repoPath: string): Promise<void> {
  const conflicts = await listConflicts(await resolveProject(repoPath, io.now()));
  if (conflicts.length === 0) {
    io.out('No conflicts: every test file is in sync between the repo and the tester sandbox.');
    return;
  }
  io.out(
    [
      `${conflicts.length} test file${conflicts.length === 1 ? ' was' : 's were'} changed both in the repo and in the tester sandbox:`,
      ...conflicts.map((path) => `  ${path}`),
      '',
      'Keep one side with: pacties resolve <file> --keep repo|tester',
    ].join('\n'),
  );
}

export async function resolveCommand(io: CliIo, path: string, keep: string, repoPath: string): Promise<void> {
  requireDeveloperTerminal(io, 'resolve');
  if (!(SIDES as string[]).includes(keep)) {
    throw new ValidationError(`--keep must be "repo" or "tester", not "${keep}"`);
  }
  const resolution = await resolveConflict(await resolveProject(repoPath, io.now()), path, keep as ConflictSide);
  const action = resolution.copyFrom === null ? `deleted it from the ${resolution.removeFrom === 'repo' ? 'repo' : 'tester sandbox'}` : `copied the ${keep} version to the other side`;
  io.out(`Resolved ${path}: kept the ${keep} version and ${action}. The next test run syncs normally.`);
}
