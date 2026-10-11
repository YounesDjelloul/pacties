import { formatReview } from '@/cli/format';
import { parseIds } from '@/cli/parse-ids';
import { requireDeveloperTerminal } from '@/cli/require-developer';
import { approveBehaviors } from '@/shell/ledger/approve-behaviors';
import { getPendingReviews, getReviews } from '@/shell/ledger/read-behaviors';
import { resolveProject } from '@/shell/project/resolve-project';
import type { CliIo } from '@/cli/cli-io';
import type { Review } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export async function approveCommand(io: CliIo, rawIds: string[], repoPath: string): Promise<void> {
  requireDeveloperTerminal(io, 'approve');
  const project = await resolveProject(repoPath, io.now());
  const reviews = rawIds.length === 0 ? await pickPendingReviews(io, project) : await getReviews(project, parseIds(rawIds));
  if (reviews.length === 0) {
    return;
  }

  io.out(reviews.map(formatReview).join('\n\n'));
  const label = reviews.map((review) => `${review.id} v${review.version}`).join(', ');
  if (!(await io.confirm(`Approve ${label}?`))) {
    io.out('Nothing approved.');
    return;
  }

  await approveBehaviors(project, reviews.map((review) => ({ id: review.id, version: review.version })), io.now());
  io.out(`Approved ${label}. The tester sees it on its next get_delta.`);
}

async function pickPendingReviews(io: CliIo, project: Project): Promise<Review[]> {
  const pending = await getPendingReviews(project);
  if (pending.length === 0) {
    io.out('Nothing is awaiting approval.');
    return [];
  }

  const chosen = await io.chooseMany(
    'Approve which behaviors?',
    pending.map((review) => ({ value: review.id, label: choiceLabel(review), checked: true })),
  );
  if (chosen.length === 0) {
    io.out('Nothing selected; nothing approved.');
  }
  return pending.filter((review) => chosen.includes(review.id));
}

function choiceLabel(review: Review): string {
  if (review.kind === 'proposal') {
    return `${review.id} v${review.version}  new       ${review.description}`;
  }
  return `${review.id} v${review.fromVersion} -> v${review.version}  revision  ${review.description}  (reason: ${review.reason})`;
}
