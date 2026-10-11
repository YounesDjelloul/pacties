import { BEHAVIOR_STATUSES } from '@/domain/ledger/constants';
import { formatBehaviorLine, formatSummary } from '@/cli/format';
import { ValidationError } from '@/lib/errors';
import { listBehaviors } from '@/shell/ledger/read-behaviors';
import { resolveProject } from '@/shell/project/resolve-project';
import type { BehaviorStatus } from '@/domain/ledger/types';
import type { CliIo } from '@/cli/cli-io';

export type ListOptions = {
  status?: string;
  all?: boolean;
  json?: boolean;
};

export async function listCommand(io: CliIo, options: ListOptions, repoPath: string): Promise<void> {
  const project = await resolveProject(repoPath, io.now());
  const listing = await listBehaviors(project, {
    ...(options.status === undefined ? {} : { statuses: parseStatuses(options.status) }),
    includeRejected: options.all === true,
  });

  if (options.json === true) {
    io.out(JSON.stringify(listing, null, 2));
    return;
  }
  io.out([`${project.name}  ${formatSummary(listing.summary)}`, '', ...listing.behaviors.map(formatBehaviorLine)].join('\n'));
}

function parseStatuses(raw: string): BehaviorStatus[] {
  const requested = raw.split(',').map((status) => status.trim().toLowerCase()).filter((status) => status.length > 0);
  const unknown = requested.filter((status) => !(BEHAVIOR_STATUSES as readonly string[]).includes(status));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown status "${unknown.join('", "')}"; use one of ${BEHAVIOR_STATUSES.join(', ')}`);
  }
  return requested as BehaviorStatus[];
}
