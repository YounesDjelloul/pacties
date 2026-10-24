import { describe, expect, it } from 'vitest';
import { failingCount, fitLine, statusLine } from '@/domain/wrapper/status-line';
import { initialWrapperState } from '@/domain/wrapper/wrapper-state';
import { approve, ledgerOf, proposeMany, recordResults, reportIssue, submitTests } from '@/test-support/ledger-script';
import type { Review } from '@/domain/ledger/types';

const review = (id: `B${number}`): Review => ({
  id,
  kind: 'proposal',
  version: 1,
  fromVersion: null,
  description: 'x',
  contract: { interface: ['f()'], dependsOn: [] },
  reason: null,
  previousDescription: null,
  contractDiff: null,
});

function busyLedger() {
  let events = approve(proposeMany([], 10), 'B1', 'B2', 'B10');
  events = submitTests(events, 'B1', 'B2', 'B10');
  events = recordResults(events, 'run-1', [{ id: 'B1', passed: 2, failed: 0 }, { id: 'B2', passed: 1, failed: 1 }, { id: 'B10', passed: 4, failed: 0 }]);
  return ledgerOf(reportIssue(events, 'B2', 'error shape missing'));
}

describe('statusLine', () => {
  it('shows approvals, the tester, results and issues, and ends with the switch hint', () => {
    const state = { ...initialWrapperState(), ledger: busyLedger(), reviews: [review('B3'), review('B4')], job: { ...initialWrapperState().job, running: { requests: [{ id: 'B9' as const, version: 1 }], plannerSessionId: 'p-1' } } };
    expect(statusLine(state, 200)).toBe('pacties · 2 to approve · tester running B9 · 2 passing · 1 failing · 1 contract issue · Ctrl-\\ pacties');
  });

  it('points back to the planner from the pacties screen', () => {
    expect(statusLine({ ...initialWrapperState('p-1'), screen: 'pacties' }, 80)).toBe('pacties · tester idle · Ctrl-\\ planner');
  });

  it('says the tester waits while pacties does not know the planner session yet', () => {
    expect(statusLine(initialWrapperState(), 120)).toBe('pacties · tester waiting for planner session · Ctrl-\\ pacties');
  });

  it('cuts the middle to keep the hint visible on a narrow terminal', () => {
    const line = statusLine({ ...initialWrapperState(), ledger: busyLedger(), reviews: [review('B3')] }, 40);
    expect(Array.from(line)).toHaveLength(40);
    expect(line.endsWith(' · Ctrl-\\ pacties')).toBe(true);
    expect(line).toContain('…');
  });

  it('survives a terminal narrower than the hint', () => {
    expect(Array.from(statusLine(initialWrapperState(), 5))).toHaveLength(5);
  });
});

describe('fitLine', () => {
  it('counts unicode characters, not bytes', () => {
    expect(fitLine('Zoë Ørsted-Ñúñez', 16)).toBe('Zoë Ørsted-Ñúñez');
    expect(fitLine('Zoë Ørsted-Ñúñez', 6)).toBe('Zoë Ø…');
    expect(fitLine('abc', 0)).toBe('');
  });
});

describe('failingCount', () => {
  it('counts behaviors whose latest results at the current version failed', () => {
    expect(failingCount(busyLedger())).toBe(1);
  });
});
