import { summarizeLedger } from '@/domain/ledger/summarize-ledger';
import type { Ledger } from '@/domain/ledger/types';
import type { WrapperState } from '@/domain/wrapper/types';

export function statusLine(state: WrapperState, width: number): string {
  const hint = state.screen === 'planner' ? 'Ctrl-\\ pacties' : 'Ctrl-\\ planner';
  const parts = ['pacties', ...approvalPart(state), testerPart(state), ...ledgerParts(state.ledger)];
  return fitWithSuffix(parts.join(' · '), ` · ${hint}`, width);
}

export function fitLine(text: string, width: number): string {
  const chars = Array.from(text);
  if (chars.length <= width) {
    return text;
  }
  return width <= 0 ? '' : `${chars.slice(0, width - 1).join('')}…`;
}

export function failingCount(ledger: Ledger): number {
  return ledger.behaviors.filter(
    (behavior) => behavior.status !== 'rejected' && behavior.lastResults !== null && behavior.lastResults.version === behavior.version && behavior.lastResults.failed > 0,
  ).length;
}

function approvalPart(state: WrapperState): string[] {
  return state.reviews.length === 0 ? [] : [`${state.reviews.length} to approve`];
}

function testerPart(state: WrapperState): string {
  const running = state.job.running;
  if (running !== null) {
    return `tester running ${running.requests.map((request) => request.id).join(',')}`;
  }
  return state.planner.sessionId === null ? 'tester waiting for planner session' : 'tester idle';
}

function ledgerParts(ledger: Ledger | null): string[] {
  if (ledger === null) {
    return [];
  }
  const summary = summarizeLedger(ledger);
  const failing = failingCount(ledger);
  const issues = ledger.behaviors.reduce((total, behavior) => total + behavior.openIssues.length, 0);
  const stopped = ledger.lastRun !== null && ledger.lastRun.status !== 'completed' ? [`⚠ last run ${ledger.lastRun.status}`] : [];
  return [
    `${summary.passing} passing`,
    ...(failing > 0 ? [`${failing} failing`] : []),
    ...(summary.stale > 0 ? [`${summary.stale} stale`] : []),
    ...(issues > 0 ? [`${issues} contract issue${issues === 1 ? '' : 's'}`] : []),
    ...stopped,
  ];
}

function fitWithSuffix(text: string, suffix: string, width: number): string {
  const suffixLength = Array.from(suffix).length;
  if (suffixLength >= width) {
    return fitLine(text, width);
  }
  return `${fitLine(text, width - suffixLength)}${suffix}`;
}
