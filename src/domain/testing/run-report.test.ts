import { describe, expect, it } from 'vitest';
import { buildPlannerRunReport, buildTesterRunReport } from '@/domain/testing/run-report';
import { REDACTION, buildSourceIndex } from '@/domain/testing/sanitize-results';
import type { RunOutcome, SyncReport } from '@/domain/testing/types';

const emptySync: SyncReport = { pulled: [], pushed: ['src/__tests__/limit.test.ts'], deletedFromRepo: [], deletedFromWorkspace: [], conflicts: [], notPushed: [], refused: [] };

const outcome = (overrides: Partial<RunOutcome> = {}): RunOutcome => ({
  runId: 'run-2026-10-25T01-59-59-500Z-7f3a',
  status: 'completed',
  sync: emptySync,
  cases: [
    { name: '[B10] refuses 10000.01', suite: 'limit', status: 'failed', message: "expected 'return totals.limit.minus(totals.spent);' to be ''", details: 'at checkDailyLimit (src/limit.ts:3:9)' },
    { name: '[B10] allows the limit', suite: 'limit', status: 'passed', message: null, details: null },
    { name: '[B9] later', suite: 'limit', status: 'skipped', message: null, details: null },
  ],
  untagged: [],
  unsubmitted: [],
  exitCode: 1,
  output: Array.from({ length: 300 }, (_, index) => `line ${index + 1}`).join('\r\n'),
  ...overrides,
});

const index = buildSourceIndex([{ path: 'src/limit.ts', content: 'export function checkDailyLimit() {\n  return totals.limit.minus(totals.spent);\n}' }]);

describe('buildPlannerRunReport', () => {
  it('gives the implementer every detail, the totals and the tail of the output', () => {
    const report = buildPlannerRunReport(outcome());
    expect(report.totals).toEqual({ passed: 1, failed: 1, skipped: 1 });
    expect(report.tests[0]?.details).toBe('at checkDailyLimit (src/limit.ts:3:9)');
    expect(report.outputTail.split('\n')).toHaveLength(120);
    expect(report.outputTail.startsWith('line 181')).toBe(true);
    expect(report.exitCode).toBe(1);
  });
});

describe('buildTesterRunReport', () => {
  it('sanitizes the tests, drops the output and exit code, and keeps the sync report', () => {
    const report = buildTesterRunReport(outcome(), index, []);
    expect(report.tests[0]).toEqual({ name: '[B10] refuses 10000.01', status: 'failed', message: REDACTION });
    expect(report).not.toHaveProperty('outputTail');
    expect(report).not.toHaveProperty('exitCode');
    expect(JSON.stringify(report)).not.toContain('src/limit.ts:3:9');
    expect(report.sync.pushed).toEqual(['src/__tests__/limit.test.ts']);
    expect(report.note).toBeNull();
  });

  it('asks the tester to submit tagged behaviors it has not submitted yet', () => {
    expect(buildTesterRunReport(outcome({ unsubmitted: ['B9', 'B12'] }), index, []).note).toBe('Call submit_tests for B9, B12 so their results count');
  });

  it.each([
    ['refused', 'sync.refused'],
    ['blocked', 'sync.conflicts'],
    ['crashed', 'exit code 1'],
  ] as const)('explains a %s run', (status, expected) => {
    expect(buildTesterRunReport(outcome({ status, cases: [] }), index, []).note).toContain(expected);
  });
});
