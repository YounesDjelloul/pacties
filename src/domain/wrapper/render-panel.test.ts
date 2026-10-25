import { describe, expect, it } from 'vitest';
import { renderPanel } from '@/domain/wrapper/render-panel';
import { initialWrapperState } from '@/domain/wrapper/wrapper-state';
import { ledgerOf, proposeMany } from '@/test-support/ledger-script';
import type { Review } from '@/domain/ledger/types';
import type { WrapperState } from '@/domain/wrapper/types';

const proposal: Review = {
  id: 'B10',
  kind: 'proposal',
  version: 1,
  fromVersion: null,
  description: 'transfer over daily limit returns 429',
  contract: { interface: ['POST /transfer'], dependsOn: [] },
  reason: null,
  previousDescription: null,
  contractDiff: null,
};
const revision: Review = { ...proposal, id: 'B2', kind: 'revision', version: 2, fromVersion: 1, description: 'payee keeps "Zoë"', reason: 'unicode names' };

function state(overrides: Partial<WrapperState> = {}): WrapperState {
  return { ...initialWrapperState('planner-1'), screen: 'pacties', ledger: ledgerOf(proposeMany([], 2)), reviews: [proposal, revision], ...overrides };
}

describe('renderPanel', () => {
  it('lists reviews with the cursor and ticks', () => {
    const lines = renderPanel(state({ cursor: 1, unticked: ['B10'] }), 120, 30);
    expect(lines).toContain('  [ ] B10 v1  new       transfer over daily limit returns 429');
    expect(lines).toContain('> [x] B2 v1 -> v2  revision  payee keeps "Zoë"  (reason: unicode names)');
  });

  it('shows the reason being typed while rejecting', () => {
    expect(renderPanel(state({ rejecting: { id: 'B10', reason: 'too broad' } }), 120, 30)).toContain('Reject B10, reason: too broad▏  (Enter confirm · Esc cancel)');
  });

  it('keeps only the latest log entries that fit and never exceeds the height or width', () => {
    const log = Array.from({ length: 50 }, (_, index) => ({ kind: 'tool' as const, text: `run_tests #${index + 1} ${'x'.repeat(200)}` }));
    const lines = renderPanel(state({ job: { ...initialWrapperState().job, log }, message: 'Approved B10 v1.' }), 60, 14);
    expect(lines).toHaveLength(14);
    expect(lines.every((line) => Array.from(line).length <= 60)).toBe(true);
    expect(lines.at(-1)).toBe('Approved B10 v1.');
    expect(lines.some((line) => line.includes('#50'))).toBe(true);
    expect(lines.some((line) => line.includes('#1 '))).toBe(false);
  });

  it('wraps every line of a long tester message under its marker instead of cutting it', () => {
    const log = [
      { kind: 'tool' as const, text: `Bash git rev-parse --show-toplevel ${'x'.repeat(80)}` },
      { kind: 'text' as const, text: 'Blocked: get_delta fails for Zoë.\r\n\n- B10 needs get_daily_total(user_id)' },
      { kind: 'error' as const, text: 'Tester job stopped (exit code 1): MCP server failed' },
    ];
    const lines = renderPanel(state({ reviews: [], job: { ...initialWrapperState().job, log } }), 30, 30);
    expect(lines.slice(-8)).toEqual([
      '  › Bash git rev-parse --show…',
      '  · Blocked: get_delta fails',
      '    for Zoë.',
      '    ',
      '    - B10 needs',
      '    get_daily_total(user_id)',
      '  ✗ Tester job stopped (exit',
      '    code 1): MCP server failed',
    ]);
  });

  it('wraps a long review under its tick box', () => {
    const long = { ...proposal, description: 'transfer over the daily limit of 10 000,01 € returns 429 for Zoë' };
    const lines = renderPanel(state({ reviews: [long] }), 40, 30);
    expect(lines).toContain('> [x] B10 v1  new       transfer over');
    expect(lines).toContain('      the daily limit of 10 000,01 €');
    expect(lines).toContain('      returns 429 for Zoë');
  });

  it('shows earlier log rows when scrolled up, never past the first row, and says how to get back', () => {
    const log = Array.from({ length: 12 }, (_, index) => ({ kind: 'tool' as const, text: `run_tests #${index + 1}` }));
    const base = state({ reviews: [], job: { ...initialWrapperState().job, log } });
    const following = renderPanel(base, 80, 10);
    expect(following).toContain('Tester: idle  (PgUp/PgDn scroll)');
    expect(following.at(-1)).toBe('  › run_tests #12');

    const scrolled = renderPanel({ ...base, logScroll: 3 }, 80, 10);
    expect(scrolled).toContain('Tester: idle  (scrolled up · PgDn/End for latest)');
    expect(scrolled.at(-1)).toBe('  › run_tests #9');

    const pastTop = renderPanel({ ...base, logScroll: 99 }, 80, 10);
    expect(pastTop.slice(-6)).toEqual(['Tester: idle  (scrolled up · PgDn/End for latest)', '  › run_tests #1', '  › run_tests #2', '  › run_tests #3', '  › run_tests #4', '  › run_tests #5']);
  });

  it('says when nothing awaits approval and warns about a blocked run', () => {
    const ledger = { ...ledgerOf(proposeMany([], 1)), lastRun: { runId: 'r', role: 'tester' as const, status: 'blocked' as const, paths: ['src/a é.test.ts'], at: 'x' } };
    const lines = renderPanel(state({ reviews: [], ledger }), 120, 30);
    expect(lines).toContain('Nothing awaiting approval.');
    expect(lines).toContain('⚠ last tester test run blocked: src/a é.test.ts (run "pacties conflicts")');
  });
});
