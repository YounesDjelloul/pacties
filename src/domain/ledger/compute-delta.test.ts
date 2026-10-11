import { describe, expect, it } from 'vitest';
import { computePlannerDelta, computeTesterDelta } from '@/domain/ledger/compute-delta';
import { approve, propose, proposeMany, reject, revise } from '@/test-support/ledger-script';
import { accentedPayeeName, refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import type { LedgerEvent } from '@/domain/ledger/types';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function transferApprovedAfterNineRefunds(): LedgerEvent[] {
  return approve(propose(proposeMany([], 9), transferOverDailyLimit), 'B10');
}

describe('computeTesterDelta', () => {
  it('returns an empty delta for an empty log', () => {
    expect(unwrap(computeTesterDelta([], 0))).toEqual({ fromSeq: 0, toSeq: 0, resync: false, changes: [] });
  });

  it('shows nothing while behaviors are only proposed', () => {
    const delta = unwrap(computeTesterDelta(proposeMany([], 4), 0));
    expect([delta.toSeq, delta.changes]).toEqual([4, []]);
  });

  it('reports an approved behavior as added with its full contract as added lines', () => {
    const delta = unwrap(computeTesterDelta(transferApprovedAfterNineRefunds(), 0));
    expect(delta.changes).toEqual([
      {
        id: 'B10',
        change: 'added',
        fromVersion: null,
        version: 1,
        fromStatus: null,
        status: 'approved',
        description: 'transfer over daily limit returns 429',
        contract: {
          interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
          dependsOn: ['get_daily_total(user_id) -> int'],
        },
        descriptionChanged: true,
        contractDiff: {
          interfaceAdded: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
          interfaceRemoved: [],
          dependsOnAdded: ['get_daily_total(user_id) -> int'],
          dependsOnRemoved: [],
        },
      },
    ]);
  });

  it('is empty when the cursor is at the head', () => {
    const events = transferApprovedAfterNineRefunds();
    expect(unwrap(computeTesterDelta(events, 11))).toEqual({ fromSeq: 11, toSeq: 11, resync: false, changes: [] });
  });

  it('never reveals a pending revision or its reason', () => {
    const events = revise(transferApprovedAfterNineRefunds(), {
      id: 'B10',
      description: 'transfer over limit returns 429 after TransferService.checkLimit()',
      reason: 'moved limit check into TransferService.checkLimit',
    });
    const delta = unwrap(computeTesterDelta(events, 11));
    expect(delta.changes).toEqual([]);
    expect(JSON.stringify(unwrap(computeTesterDelta(events, 0)))).not.toMatch(/TransferService|pending|reason/u);
  });

  it('never reveals rejected proposals or drafts revised and then rejected', () => {
    let events = propose([], refundOutsideWindow);
    events = revise(events, { id: 'B1', description: 'refund after 31 days is refused with 422', reason: 'status code' });
    events = reject(events, 'B1', 'billing owns refunds');
    expect(unwrap(computeTesterDelta(events, 0)).changes).toEqual([]);
  });

  it('coalesces several revisions and approvals of one behavior since the cursor into one entry', () => {
    let events = transferApprovedAfterNineRefunds();
    const cursor = 11;
    events = revise(events, { id: 'B10', contract: { dependsOn: ['get_daily_total(user_id, day: LocalDate) -> Decimal'] }, reason: 'per calendar day' });
    events = approve(events, 'B10');
    events = revise(events, { id: 'B10', contract: { interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining, retry_after }'] }, reason: 'retry hint' });
    events = approve(events, 'B10');
    const delta = unwrap(computeTesterDelta(events, cursor));
    expect(delta.changes).toHaveLength(1);
    expect(delta.changes[0]).toMatchObject({
      id: 'B10',
      change: 'revised',
      fromVersion: 1,
      version: 3,
      descriptionChanged: false,
      contractDiff: {
        interfaceAdded: ['-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining, retry_after }'],
        interfaceRemoved: ['-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
        dependsOnAdded: ['get_daily_total(user_id, day: LocalDate) -> Decimal'],
        dependsOnRemoved: ['get_daily_total(user_id) -> int'],
      },
    });
  });

  it('reports a behavior approved and revised within one window as added at its latest version', () => {
    let events = propose([], accentedPayeeName);
    events = approve(events, 'B1');
    events = approve(revise(events, { id: 'B1', description: 'payee "Zoë Ørsted" keeps diacritics', reason: 'shorter' }), 'B1');
    expect(unwrap(computeTesterDelta(events, 0)).changes[0]).toMatchObject({ change: 'added', fromVersion: null, version: 2 });
  });

  it('only lists behaviors that changed after the cursor', () => {
    let events = approve(proposeMany([], 12), 'B2', 'B11');
    const cursor = events.at(-1)!.seq;
    events = approve(events, 'B12', 'B3');
    expect(unwrap(computeTesterDelta(events, cursor)).changes.map((change) => change.id)).toEqual(['B3', 'B12']);
  });

  it.each([
    ['beyond the head', 99],
    ['negative', -1],
    ['fractional', 2.5],
    ['not a number', Number.NaN],
  ])('resyncs from zero when the cursor is %s', (_, cursor) => {
    const delta = unwrap(computeTesterDelta(transferApprovedAfterNineRefunds(), cursor));
    expect([delta.fromSeq, delta.toSeq, delta.resync, delta.changes.map((change) => change.id)]).toEqual([0, 11, true, ['B10']]);
  });

  it('fails when the log cannot be folded', () => {
    const broken = transferApprovedAfterNineRefunds().map((event) => (event.seq === 5 ? { ...event, seq: 6 } : event));
    expect(computeTesterDelta(broken, 0).ok).toBe(false);
  });
});

describe('computePlannerDelta', () => {
  it('shows drafts, pending revisions and decisions', () => {
    let events = proposeMany([], 2);
    const cursor = events.at(-1)!.seq;
    events = propose(events, transferOverDailyLimit);
    events = approve(events, 'B1');
    events = reject(events, 'B2', '  duplicates\nB1 ');
    events = revise(events, { id: 'B1', description: 'refund #1 within 14 days restores the balance', reason: 'policy changed' });
    const delta = unwrap(computePlannerDelta(events, cursor));

    expect(delta.changes.map(({ id, change, fromStatus, status }) => ({ id, change, fromStatus, status }))).toEqual([
      { id: 'B1', change: 'status_changed', fromStatus: 'planned', status: 'approved' },
      { id: 'B2', change: 'status_changed', fromStatus: 'planned', status: 'rejected' },
      { id: 'B3', change: 'added', fromStatus: null, status: 'planned' },
    ]);
    expect(delta.changes[0]?.pendingRevision).toMatchObject({ version: 2, reason: 'policy changed' });
    expect(delta.decisions).toEqual([
      { id: 'B1', decision: 'approved', version: 1, reason: null, at: events[3]!.at },
      { id: 'B2', decision: 'rejected', version: 1, reason: 'duplicates B1', at: events[4]!.at },
    ]);
  });

  it('reports a newly pending revision as revision_pending', () => {
    const events = revise(transferApprovedAfterNineRefunds(), { id: 'B10', description: 'transfer over limit returns 429', reason: 'shorter' });
    const delta = unwrap(computePlannerDelta(events, 11));
    expect(delta.changes).toMatchObject([{ id: 'B10', change: 'revision_pending', version: 1, pendingRevision: { version: 2 } }]);
  });

  it('reports a dropped pending revision as revision_pending with no revision left', () => {
    let events = revise(transferApprovedAfterNineRefunds(), { id: 'B10', description: 'transfer over limit returns 418', reason: 'joke' });
    const cursor = events.at(-1)!.seq;
    events = reject(events, 'B10', 'not a teapot');
    const delta = unwrap(computePlannerDelta(events, cursor));
    expect(delta.changes).toMatchObject([{ id: 'B10', change: 'revision_pending', pendingRevision: null }]);
    expect(delta.decisions).toMatchObject([{ id: 'B10', decision: 'rejected', version: 2, reason: 'not a teapot' }]);
  });

  it('reports draft edits as revised with the version bump', () => {
    let events = propose([], refundOutsideWindow);
    events = revise(events, { id: 'B1', contract: { dependsOn: [] }, reason: 'purchase date comes in the request' });
    const delta = unwrap(computePlannerDelta(events, 1));
    expect(delta.changes).toMatchObject([
      { id: 'B1', change: 'revised', fromVersion: 1, version: 2, contractDiff: { dependsOnRemoved: ['get_order(order_id) -> { purchased_at: ISO-8601 }'] } },
    ]);
  });

  it('is empty with no decisions when the cursor is at the head', () => {
    const events = transferApprovedAfterNineRefunds();
    expect(unwrap(computePlannerDelta(events, 11))).toEqual({ fromSeq: 11, toSeq: 11, resync: false, changes: [], decisions: [] });
  });

  it('sees a different delta than the tester over the same events and cursor', () => {
    const events = revise(propose(transferApprovedAfterNineRefunds(), accentedPayeeName), { id: 'B10', description: 'transfer over limit returns 429', reason: 'shorter' });
    expect(unwrap(computeTesterDelta(events, 11)).changes).toEqual([]);
    expect(unwrap(computePlannerDelta(events, 11)).changes.map((change) => change.id)).toEqual(['B10', 'B11']);
  });

  it('includes every decision when resyncing', () => {
    const delta = unwrap(computePlannerDelta(transferApprovedAfterNineRefunds(), 500));
    expect([delta.resync, delta.decisions.map((decision) => decision.id)]).toEqual([true, ['B10']]);
  });
});
