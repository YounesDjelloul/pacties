import { summarizeLedger } from '@/domain/ledger/summarize-ledger';
import { fitLine } from '@/domain/wrapper/status-line';
import { wrapText } from '@/domain/wrapper/wrap-text';
import type { Review } from '@/domain/ledger/types';
import type { JobLogEntry, WrapperState } from '@/domain/wrapper/types';

const LOG_MARKERS: Record<JobLogEntry['kind'], string> = { text: '·', tool: '›', result: '✓', error: '✗' };
const LOG_INDENT = '    ';
const REVIEW_INDENT = '      ';

type PanelLayout = {
  top: string[];
  bottom: string[];
  logRows: string[];
  room: number;
};

export type LogViewport = {
  room: number;
  maxScroll: number;
};

export function renderPanel(state: WrapperState, width: number, height: number): string[] {
  const layout = panelLayout(state, width, height);
  const scroll = Math.min(state.logScroll, maxScrollOf(layout));
  const end = layout.logRows.length - scroll;
  const visible = layout.room === 0 ? [] : layout.logRows.slice(Math.max(0, end - layout.room), end);
  return [...layout.top, ...visible, ...layout.bottom].slice(0, height).map((line) => fitLine(line, width));
}

export function logViewport(state: WrapperState): LogViewport {
  const layout = panelLayout(state, state.panelSize.width, state.panelSize.height);
  return { room: layout.room, maxScroll: maxScrollOf(layout) };
}

export function logEntryRows(entry: JobLogEntry, width: number): string[] {
  const marker = `  ${LOG_MARKERS[entry.kind]} `;
  if (entry.kind === 'tool') {
    return [`${marker}${entry.text}`];
  }
  return indented(marker, LOG_INDENT, entry.text, width);
}

function panelLayout(state: WrapperState, width: number, height: number): PanelLayout {
  const top = [
    ...wrapText(`pacties  ${summaryText(state)}`, width),
    ...warningLines(state).flatMap((line) => wrapText(line, width)),
    '',
    ...approvalLines(state, width),
    '',
    ...wrapText(testerHeading(state), width),
  ];
  const bottom = state.message === null ? [] : ['', ...wrapText(state.message, width)];
  const logRows = state.job.log.flatMap((entry) => logEntryRows(entry, width));
  return { top, bottom, logRows, room: Math.max(0, height - top.length - bottom.length) };
}

function maxScrollOf(layout: PanelLayout): number {
  return layout.room === 0 ? 0 : Math.max(0, layout.logRows.length - layout.room);
}

function indented(firstPrefix: string, restPrefix: string, text: string, width: number): string[] {
  const rows = wrapText(text, width - Array.from(restPrefix).length);
  return (rows.length === 0 ? [''] : rows).map((row, index) => `${index === 0 ? firstPrefix : restPrefix}${row}`);
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

function approvalLines(state: WrapperState, width: number): string[] {
  if (state.reviews.length === 0) {
    return ['Nothing awaiting approval.'];
  }
  const lines = [
    ...wrapText('Awaiting approval  (↑↓ move · space tick · a approve ticked · r reject)', width),
    ...state.reviews.flatMap((review, index) => {
      const pointer = index === state.cursor ? '>' : ' ';
      const tick = state.unticked.includes(review.id) ? '[ ]' : '[x]';
      return indented(`${pointer} ${tick} `, REVIEW_INDENT, reviewLabel(review), width);
    }),
  ];
  if (state.rejecting !== null) {
    lines.push(...wrapText(`Reject ${state.rejecting.id}, reason: ${state.rejecting.reason}▏  (Enter confirm · Esc cancel)`, width));
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
  const scrolling = state.job.log.length === 0 ? '' : state.logScroll > 0 ? '  (scrolled up · PgDn/End for latest)' : '  (PgUp/PgDn scroll)';
  const running = state.job.running;
  if (running !== null) {
    return `Tester: working on ${running.requests.map((request) => `${request.id} v${request.version}`).join(', ')}${scrolling}`;
  }
  return state.planner.sessionId === null ? `Tester: waiting until pacties knows which planner session you picked${scrolling}` : `Tester: idle${scrolling}`;
}
