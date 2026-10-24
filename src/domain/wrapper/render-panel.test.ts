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

  it('says when nothing awaits approval and warns about a blocked run', () => {
    const ledger = { ...ledgerOf(proposeMany([], 1)), lastRun: { runId: 'r', role: 'tester' as const, status: 'blocked' as const, paths: ['src/a é.test.ts'], at: 'x' } };
    const lines = renderPanel(state({ reviews: [], ledger }), 120, 30);
    expect(lines).toContain('Nothing awaiting approval.');
    expect(lines).toContain('⚠ last tester test run blocked: src/a é.test.ts (run "pacties conflicts")');
  });
});
