import { describe, expect, it } from 'vitest';
import { testerView } from '@/domain/ledger/tester-view';
import { EMPTY_LEDGER } from '@/domain/ledger/fold-ledger';
import { approve, ledgerOf, propose, proposeMany, reject, revise, withStatus } from '@/test-support/ledger-script';
import { transferOverDailyLimit } from '@/test-support/behavior-fixtures';

describe('testerView', () => {
  it('is empty for an empty ledger', () => {
    expect(testerView(EMPTY_LEDGER)).toEqual([]);
  });

  it('hides planned drafts and rejected proposals', () => {
    const events = approve(reject(proposeMany([], 12), 'B11', 'dup of B3'), 'B10', 'B2');
    expect(testerView(ledgerOf(events)).map((view) => view.id)).toEqual(['B2', 'B10']);
  });

  it('shows the approved content, not the pending revision, and never exposes revision fields', () => {
    let events = approve(propose([], transferOverDailyLimit), 'B1');
    events = revise(events, { id: 'B1', description: 'transfer over limit returns 403 because fraud check runs first', reason: 'implemented fraud check inside TransferService' });
    expect(testerView(ledgerOf(events))).toEqual([
      {
        id: 'B1',
        version: 1,
        status: 'approved',
        description: 'transfer over daily limit returns 429',
        contract: {
          interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
          dependsOn: ['get_daily_total(user_id) -> int'],
        },
      },
    ]);
  });

  it('shows the new version once a revision is approved', () => {
    let events = approve(propose([], transferOverDailyLimit), 'B1');
    events = approve(revise(events, { id: 'B1', description: 'transfer over limit returns 429', reason: 'shorter' }), 'B1');
    expect(testerView(ledgerOf(events))[0]).toMatchObject({ version: 2, description: 'transfer over limit returns 429' });
  });

  it.each(['tested', 'passing', 'stale'] as const)('keeps %s behaviors visible with their status', (status) => {
    const ledger = withStatus(approve(proposeMany([], 1), 'B1'), 'B1', status);
    expect(testerView(ledger)[0]?.status).toBe(status);
  });
});
