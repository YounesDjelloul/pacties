import { formatReview } from '@/cli/format';
import { parseId } from '@/cli/parse-ids';
import { requireDeveloperTerminal } from '@/cli/require-developer';
import { getReviews } from '@/shell/ledger/read-behaviors';
import { rejectBehavior } from '@/shell/ledger/reject-behavior';
import { resolveProject } from '@/shell/project/resolve-project';
import type { CliIo } from '@/cli/cli-io';

export async function rejectCommand(io: CliIo, rawId: string, reason: string, repoPath: string): Promise<void> {
  requireDeveloperTerminal(io, 'reject');
  const id = parseId(rawId);
  const project = await resolveProject(repoPath, io.now());
  const review = (await getReviews(project, [id]))[0]!;

  io.out(formatReview(review));
  const label = review.kind === 'proposal' ? review.id : `the pending revision v${review.version} of ${review.id}`;
  if (!(await io.confirm(`Reject ${label}?`))) {
    io.out('Nothing rejected.');
    return;
  }

  await rejectBehavior(project, { id, reason }, io.now());
  io.out(`Rejected ${label}. The planner sees your reason on its next get_delta.`);
}
