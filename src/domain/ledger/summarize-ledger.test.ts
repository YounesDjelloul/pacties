import { describe, expect, it } from 'vitest';
import { summarizeLedger } from '@/domain/ledger/summarize-ledger';
import { EMPTY_LEDGER } from '@/domain/ledger/fold-ledger';
import { approve, ledgerOf, proposeMany, reject, revise } from '@/test-support/ledger-script';

describe('summarizeLedger', () => {
  it('reports zero for every status on an empty ledger', () => {
    expect(summarizeLedger(EMPTY_LEDGER)).toEqual({
      planned: 0, approved: 0, tested: 0, passing: 0, stale: 0, rejected: 0, pendingRevisions: 0,
    });
  });

  it('counts each status and pending revisions independently', () => {
    let events = proposeMany([], 13);
    events = approve(events, 'B1', 'B4', 'B10', 'B13');
    events = reject(events, 'B7', 'out of scope');
    events = revise(events, { id: 'B10', description: 'refund #10 within 14 days', reason: 'policy changed' });
    events = revise(events, { id: 'B3', description: 'refund #3 within 14 days', reason: 'policy changed' });
    expect(summarizeLedger(ledgerOf(events))).toEqual({
      planned: 8, approved: 4, tested: 0, passing: 0, stale: 0, rejected: 1, pendingRevisions: 1,
    });
  });
});
