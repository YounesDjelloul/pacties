import { summarizeLedger } from '@/domain/ledger/summarize-ledger';
import { fitLine } from '@/domain/wrapper/status-line';
import type { Review } from '@/domain/ledger/types';
import type { JobLogEntry, WrapperState } from '@/domain/wrapper/types';

const LOG_MARKERS: Record<JobLogEntry['kind'], string> = { text: '·', tool: '›', result: '✓', error: '✗' };

export function renderPanel(state: WrapperState, width: number, height: number): string[] {
  const top = [
    `pacties  ${summaryText(state)}`,
    ...warningLines(state),
    '',
    ...approvalLines(state),
    '',
    testerHeading(state),
  ];
  const bottom = state.message === null ? [] : ['', state.message];
  const logRoom = Math.max(0, height - top.length - bottom.length);
  const log = state.job.log.slice(-logRoom).map((entry) => `  ${LOG_MARKERS[entry.kind]} ${entry.text}`);
  return [...top, ...log, ...bottom].slice(0, height).map((line) => fitLine(line, width));
}

function summaryText(state: WrapperState): string {
  if (state.ledger === null) {
    return 'loading…';
  }
  const summary = summarizeLedger(state.ledger);
  return `${summary.planned} planned · ${summary.approved} approved · ${summary.tested} tested · ${summary.passing} passing · ${summary.stale} stale`;
}

function warningLines(state: WrapperState): string[] {
  const run = state.ledger?.lastRun ?? null;
  if (run === null || run.status === 'completed') {
    return [];
  }
  const where = run.paths.length === 0 ? '' : `: ${run.paths.join(', ')}`;
  const advice = run.status === 'blocked' ? ' (run "pacties conflicts")' : '';
  return [`⚠ last ${run.role} test run ${run.status}${where}${advice}`];
}

function approvalLines(state: WrapperState): string[] {
  if (state.reviews.length === 0) {
    return ['Nothing awaiting approval.'];
  }
  const lines = [
    'Awaiting approval  (↑↓ move · space tick · a approve ticked · r reject)',
    ...state.reviews.map((review, index) => {
      const pointer = index === state.cursor ? '>' : ' ';
      const tick = state.unticked.includes(review.id) ? '[ ]' : '[x]';
      return `${pointer} ${tick} ${reviewLabel(review)}`;
    }),
  ];
  if (state.rejecting !== null) {
    lines.push(`Reject ${state.rejecting.id}, reason: ${state.rejecting.reason}▏  (Enter confirm · Esc cancel)`);
  }
  return lines;
}

function reviewLabel(review: Review): string {
  if (review.kind === 'proposal') {
    return `${review.id} v${review.version}  new       ${review.description}`;
  }
  return `${review.id} v${review.fromVersion} -> v${review.version}  revision  ${review.description}  (reason: ${review.reason})`;
}

function testerHeading(state: WrapperState): string {
  const running = state.job.running;
  if (running !== null) {
    return `Tester: working on ${running.requests.map((request) => `${request.id} v${request.version}`).join(', ')}`;
  }
  return state.planner.sessionId === null ? 'Tester: waiting until pacties knows which planner session you picked' : 'Tester: idle';
}
