import { sanitizeForTester } from '@/domain/testing/sanitize-results';
import type { PlannerRunReport, RunOutcome, RunTotals, SourceIndex, TestCase, TesterRunReport } from '@/domain/testing/types';

const OUTPUT_TAIL_LINES = 120;

export function buildPlannerRunReport(outcome: RunOutcome): PlannerRunReport {
  return {
    runId: outcome.runId,
    status: outcome.status,
    totals: totalsOf(outcome.cases),
    tests: outcome.cases,
    untagged: outcome.untagged,
    unsubmitted: outcome.unsubmitted,
    sync: outcome.sync,
    exitCode: outcome.exitCode,
    outputTail: outcome.output.split(/\r?\n/u).slice(-OUTPUT_TAIL_LINES).join('\n'),
  };
}

export function buildTesterRunReport(outcome: RunOutcome, index: SourceIndex, hiddenPaths: string[]): TesterRunReport {
  return {
    runId: outcome.runId,
    status: outcome.status,
    totals: totalsOf(outcome.cases),
    tests: sanitizeForTester(outcome.cases, index, hiddenPaths),
    untagged: outcome.untagged,
    unsubmitted: outcome.unsubmitted,
    sync: outcome.sync,
    note: testerNote(outcome),
  };
}

function testerNote(outcome: RunOutcome): string | null {
  switch (outcome.status) {
    case 'completed':
      return outcome.unsubmitted.length === 0 ? null : `Call submit_tests for ${outcome.unsubmitted.join(', ')} so their results count`;
    case 'refused':
      return 'Nothing ran: some tests reach the file system, spawn processes or print source code. Remove those uses (listed in sync.refused) and run again.';
    case 'blocked':
      return 'Nothing ran: some test files were also changed in the repository since your last sync (listed in sync.conflicts). Tell the developer; they decide which version to keep.';
    case 'crashed':
      return `The test command stopped before reporting results (exit code ${outcome.exitCode ?? 'none'}). This usually means a test file does not compile or imports something the contract does not list.`;
  }
}

function totalsOf(cases: TestCase[]): RunTotals {
  return {
    passed: cases.filter((testCase) => testCase.status === 'passed').length,
    failed: cases.filter((testCase) => testCase.status === 'failed').length,
    skipped: cases.filter((testCase) => testCase.status === 'skipped').length,
  };
}
