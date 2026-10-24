import type { Behavior, ContractDiff, LedgerSummary, Review, RunRecord } from '@/domain/ledger/types';

export function formatBehaviorLine(behavior: Behavior): string {
  const pending = behavior.pendingRevision === null ? '' : `  (revision v${behavior.pendingRevision.version} pending)`;
  return `${behavior.id.padEnd(5)} ${behavior.status.padEnd(9)} v${String(behavior.version).padEnd(3)} ${behavior.description}${pending}`;
}

export function formatSummary(summary: LedgerSummary): string {
  const total = summary.planned + summary.approved + summary.tested + summary.passing + summary.stale;
  const parts = [`${total} behaviors`, `${summary.planned} planned`, `${summary.approved} approved`, `${summary.tested} tested`, `${summary.passing} passing`];
  if (summary.stale > 0) {
    parts.push(`${summary.stale} stale`);
  }
  if (summary.pendingRevisions > 0) {
    parts.push(`${summary.pendingRevisions} pending revision${summary.pendingRevisions === 1 ? '' : 's'}`);
  }
  return parts.join(' | ');
}

export function formatBehaviorDetail(behavior: Behavior): string {
  const lines = [
    `${behavior.id}  ${behavior.description}`,
    `  status: ${behavior.status}   version: ${behavior.version}${behavior.approvedAt === null ? '' : `   approved: ${behavior.approvedAt}`}`,
    ...formatContract(behavior.contract.interface, behavior.contract.dependsOn),
  ];
  if (behavior.pendingRevision !== null) {
    lines.push(
      `  pending revision v${behavior.pendingRevision.version}: ${behavior.pendingRevision.description}`,
      `    reason: ${behavior.pendingRevision.reason}`,
    );
  }
  return lines.join('\n');
}

export function formatReview(review: Review): string {
  if (review.kind === 'proposal') {
    return [`${review.id} v${review.version} (new)  ${review.description}`, ...formatContract(review.contract.interface, review.contract.dependsOn)].join('\n');
  }

  const lines = [`${review.id} v${review.fromVersion} -> v${review.version}  ${review.description}`, `  reason: ${review.reason}`];
  if (review.previousDescription !== null) {
    lines.push(`  - ${review.previousDescription}`, `  + ${review.description}`);
  }
  if (review.contractDiff !== null) {
    lines.push(...formatDiff(review.contractDiff));
  }
  return lines.join('\n');
}

function formatContract(interfaceLines: string[], dependsOn: string[]): string[] {
  return [
    '  contract:',
    ...interfaceLines.map((line) => `    ${line}`),
    ...(dependsOn.length === 0 ? [] : ['  depends on:', ...dependsOn.map((line) => `    ${line}`)]),
  ];
}

function formatDiff(diff: ContractDiff): string[] {
  return [
    ...diff.interfaceRemoved.map((line) => `  - contract: ${line}`),
    ...diff.interfaceAdded.map((line) => `  + contract: ${line}`),
    ...diff.dependsOnRemoved.map((line) => `  - depends on: ${line}`),
    ...diff.dependsOnAdded.map((line) => `  + depends on: ${line}`),
  ];
}

export function formatRunWarning(run: RunRecord | null): string | null {
  if (run === null || run.status === 'completed') {
    return null;
  }
  const by = `the last ${run.role} test run (${run.at})`;
  switch (run.status) {
    case 'blocked':
      return `⚠ ${by} was blocked: ${run.paths.join(', ')} changed both in the repo and in the tester sandbox. Run "pacties conflicts".`;
    case 'refused':
      return `⚠ ${by} was refused: ${run.paths.join(', ')} read files, spawn processes or print source, so they were not copied into the repo.`;
    case 'crashed':
      return `⚠ ${by} crashed before reporting results; the planner's run_tests shows the output.`;
  }
}
