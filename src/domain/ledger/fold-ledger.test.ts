import { describe, expect, it } from 'vitest';
import { EMPTY_LEDGER, applyEvent, foldLedger } from '@/domain/ledger/fold-ledger';
import { approve, behaviorIn, ledgerOf, propose, proposeMany, recordResults, reject, reportIssue, revise, submitTests } from '@/test-support/ledger-script';
import { accentedPayeeName, refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import type { BehaviorStatus, LedgerEvent } from '@/domain/ledger/types';

const AT = '2026-03-29T01:00:00.001Z';

const proposed = (seq: number, behaviorId: `B${number}`): LedgerEvent => ({
  type: 'behavior_proposed',
  seq,
  at: AT,
  actor: 'planner',
  behaviorId,
  content: { description: `behavior ${behaviorId}`, contract: { interface: ['f() -> g'], dependsOn: [] } },
});

function interleaved(): LedgerEvent[] {
  let events = proposeMany([], 2);
  events = propose(events, transferOverDailyLimit);
  events = proposeMany(events, 6);
  events = propose(events, refundOutsideWindow);
  events = revise(events, { id: 'B3', contract: { dependsOn: [] }, reason: 'limit read from request' });
  events = approve(events, 'B10', 'B3');
  events = propose(events, accentedPayeeName);
  events = reject(events, 'B4', 'not needed');
  return events;
}

describe('foldLedger', () => {
  it('returns the empty ledger for an empty log', () => {
    expect(foldLedger([])).toEqual({ ok: true, value: EMPTY_LEDGER });
  });

  it('tracks headSeq as the seq of the last event', () => {
    expect(ledgerOf(interleaved()).headSeq).toBe(15);
  });

  it('keeps behaviors in numeric id order across interleaved events', () => {
    expect(ledgerOf(interleaved()).behaviors.map((behavior) => behavior.id)).toEqual([
      'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11',
    ]);
  });

  it('folds a proposal into a planned v1 with no approval', () => {
    expect(behaviorIn(propose([], refundOutsideWindow), 'B1')).toEqual({
      id: 'B1',
      description: 'refund requested 31 days after purchase is refused',
      contract: {
        interface: ['POST /refunds { order_id, reason } -> 422 { error: "REFUND_WINDOW_CLOSED", closed_at }'],
        dependsOn: ['get_order(order_id) -> { purchased_at: ISO-8601 }'],
      },
      version: 1,
      status: 'planned',
      pendingRevision: null,
      approvedAt: null,
      testedVersion: null,
      lastResults: null,
      openIssues: [],
    });
  });

  it('bumps the draft version on every revision before approval', () => {
    let events = propose([], transferOverDailyLimit);
    for (const amount of ['10000.01', '9999.99', '0.01', '1e6']) {
      events = revise(events, { id: 'B1', description: `transfer of ${amount} over daily limit returns 429`, reason: `limit edge ${amount}` });
    }
    const behavior = behaviorIn(events, 'B1');
    expect([behavior.version, behavior.status, behavior.description]).toEqual([5, 'planned', 'transfer of 1e6 over daily limit returns 429']);
  });

  it('approves a draft at its current version and records approvedAt', () => {
    const events = approve(revise(propose([], accentedPayeeName), { id: 'B1', description: 'payee "Zoë" keeps diacritics', reason: 'shorter' }), 'B1');
    const behavior = behaviorIn(events, 'B1');
    expect([behavior.status, behavior.version, behavior.approvedAt]).toEqual(['approved', 2, events.at(-1)?.at]);
  });

  it('stores a revision of an approved behavior as pending without touching approved content', () => {
    const events = revise(approve(propose([], transferOverDailyLimit), 'B1'), {
      id: 'B1',
      contract: { interface: ['POST /transfer { from_id, to_id, amount } -> 429 { remaining, retry_after }'] },
      reason: 'merge lines and add retry_after',
    });
    const behavior = behaviorIn(events, 'B1');
    expect(behavior.version).toBe(1);
    expect(behavior.status).toBe('approved');
    expect(behavior.contract.interface).toHaveLength(2);
    expect(behavior.pendingRevision).toEqual({
      description: 'transfer over daily limit returns 429',
      contract: {
        interface: ['POST /transfer { from_id, to_id, amount } -> 429 { remaining, retry_after }'],
        dependsOn: ['get_daily_total(user_id) -> int'],
      },
      reason: 'merge lines and add retry_after',
      version: 2,
    });
  });

  it('replaces a pending revision without bumping the pending version again', () => {
    let events = approve(propose([], transferOverDailyLimit), 'B1');
    events = revise(events, { id: 'B1', description: 'transfer over limit returns 429 v-a', reason: 'a' });
    events = revise(events, { id: 'B1', description: 'transfer over limit returns 429 v-b', reason: 'b' });
    expect(behaviorIn(events, 'B1').pendingRevision).toMatchObject({ version: 2, description: 'transfer over limit returns 429 v-b', reason: 'b' });
  });

  it('applies an approved revision to an only-approved behavior and keeps it approved', () => {
    let events = approve(propose([], transferOverDailyLimit), 'B1');
    events = approve(revise(events, { id: 'B1', description: 'transfer over limit returns 429', reason: 'shorter' }), 'B1');
    const behavior = behaviorIn(events, 'B1');
    expect([behavior.status, behavior.version, behavior.description, behavior.pendingRevision]).toEqual([
      'approved', 2, 'transfer over limit returns 429', null,
    ]);
  });

  it.each<[BehaviorStatus]>([['tested'], ['passing'], ['stale']])(
    'marks a %s behavior stale when its revision is approved',
    (status) => {
      const base = revise(approve(propose([], transferOverDailyLimit), 'B1'), { id: 'B1', description: 'transfer over limit returns 429', reason: 'shorter' });
      const ledger = ledgerOf(base);
      const withTests = { ...ledger, behaviors: ledger.behaviors.map((behavior) => ({ ...behavior, status })) };
      const approval: LedgerEvent = { type: 'behavior_approved', seq: ledger.headSeq + 1, at: AT, actor: 'developer', behaviorId: 'B1', version: 2 };
      const applied = applyEvent(withTests, approval);
      expect(applied.ok && applied.value.behaviors[0]?.status).toBe('stale');
    },
  );

  it('rejects a draft as a terminal status', () => {
    expect(behaviorIn(reject(proposeMany([], 1), 'B1', 'dup'), 'B1').status).toBe('rejected');
  });

  it('drops only the pending revision when it is rejected', () => {
    let events = approve(propose([], transferOverDailyLimit), 'B1');
    events = reject(revise(events, { id: 'B1', description: 'transfer over limit returns 418', reason: 'joke' }), 'B1', 'no');
    const behavior = behaviorIn(events, 'B1');
    expect([behavior.status, behavior.version, behavior.description, behavior.pendingRevision]).toEqual([
      'approved', 1, 'transfer over daily limit returns 429', null,
    ]);
  });

  it('fails when the first seq is not 1', () => {
    expect(foldLedger([proposed(2, 'B1')])).toEqual({ ok: false, error: 'Event log is out of order: expected seq 1 but found 2' });
  });

  it('fails on a gap in seq', () => {
    expect(foldLedger([proposed(1, 'B1'), proposed(3, 'B2')])).toEqual({
      ok: false,
      error: 'Event log is out of order: expected seq 2 but found 3',
    });
  });

  it('fails on a duplicated seq', () => {
    expect(foldLedger([proposed(1, 'B1'), proposed(1, 'B2')]).ok).toBe(false);
  });

  it('fails when the same id is proposed twice', () => {
    expect(foldLedger([proposed(1, 'B7'), proposed(2, 'B7')])).toEqual({
      ok: false,
      error: 'Event 2 proposes B7, which already exists',
    });
  });

  it('fails when an event refers to a behavior that was never proposed', () => {
    const approval: LedgerEvent = { type: 'behavior_approved', seq: 2, at: AT, actor: 'developer', behaviorId: 'B12', version: 1 };
    expect(foldLedger([proposed(1, 'B1'), approval])).toEqual({
      ok: false,
      error: 'Event 2 refers to B12, which was never proposed',
    });
  });

  it('fails when an approval names a version other than the draft', () => {
    const approval: LedgerEvent = { type: 'behavior_approved', seq: 2, at: AT, actor: 'developer', behaviorId: 'B1', version: 2 };
    expect(foldLedger([proposed(1, 'B1'), approval]).ok).toBe(false);
  });

  it('fails when an approval has no matching pending revision', () => {
    const events = approve([proposed(1, 'B1')], 'B1');
    const approval: LedgerEvent = { type: 'behavior_approved', seq: 3, at: AT, actor: 'developer', behaviorId: 'B1', version: 2 };
    expect(foldLedger([...events, approval])).toEqual({
      ok: false,
      error: 'Event 3 approves B1 v2, but no such revision is pending',
    });
  });

  it('fails when a rejection targets an approved behavior with nothing pending', () => {
    const events = approve([proposed(1, 'B1')], 'B1');
    const rejection: LedgerEvent = { type: 'behavior_rejected', seq: 3, at: AT, actor: 'developer', behaviorId: 'B1', version: 1, reason: 'x' };
    expect(foldLedger([...events, rejection]).ok).toBe(false);
  });

  it('fails when any event targets a rejected behavior', () => {
    const events = reject([proposed(1, 'B1')], 'B1', 'dup');
    const revision: LedgerEvent = {
      type: 'behavior_revised', seq: 3, at: AT, actor: 'planner', behaviorId: 'B1', reason: 'revive',
      content: { description: 'revived', contract: { interface: ['f()'], dependsOn: [] } },
    };
    expect(foldLedger([...events, revision])).toEqual({ ok: false, error: 'Event 3 changes B1, which was rejected' });
  });

  it('does not mutate the events it folds', () => {
    const events = interleaved();
    const snapshot = structuredClone(events);
    foldLedger(events);
    expect(events).toEqual(snapshot);
  });
});

describe('foldLedger with test events', () => {
  function testedTransfer(): LedgerEvent[] {
    let events = approve(propose(proposeMany([], 9), transferOverDailyLimit), 'B9', 'B10');
    events = submitTests(events, 'B10');
    return events;
  }

  const stateOf = (events: LedgerEvent[], id: `B${number}`) => {
    const behavior = behaviorIn(events, id);
    return { status: behavior.status, version: behavior.version, testedVersion: behavior.testedVersion, lastResults: behavior.lastResults };
  };

  it('marks a submitted behavior tested at its version and leaves its neighbours alone', () => {
    const events = testedTransfer();
    expect(stateOf(events, 'B10')).toEqual({ status: 'tested', version: 1, testedVersion: 1, lastResults: null });
    expect(behaviorIn(events, 'B9').status).toBe('approved');
  });

  it('marks a behavior passing when every tagged test passed', () => {
    const events = recordResults(testedTransfer(), 'run-2', [{ id: 'B10', passed: 7, failed: 0 }]);
    expect(stateOf(events, 'B10')).toEqual({ status: 'passing', version: 1, testedVersion: 1, lastResults: { version: 1, runId: 'run-2', passed: 7, failed: 0 } });
  });

  it('keeps a behavior tested when any tagged test failed', () => {
    const events = recordResults(testedTransfer(), 'run-2', [{ id: 'B10', passed: 6, failed: 1 }]);
    expect(stateOf(events, 'B10').status).toBe('tested');
  });

  it('keeps a behavior tested when the run found none of its tests', () => {
    const events = recordResults(testedTransfer(), 'run-2', [{ id: 'B9', passed: 2, failed: 0 }]);
    expect(stateOf(events, 'B10')).toMatchObject({ status: 'tested', lastResults: { passed: 0, failed: 0 } });
  });

  it('drops a passing behavior back to tested when its tests are resubmitted', () => {
    let events = recordResults(testedTransfer(), 'run-2', [{ id: 'B10', passed: 7, failed: 0 }]);
    events = submitTests(events, 'B10');
    expect(stateOf(events, 'B10')).toEqual({ status: 'tested', version: 1, testedVersion: 1, lastResults: null });
  });

  it('goes stale on an approved revision, ignores old results, and clears stale on a resubmit at the new version', () => {
    let events = recordResults(testedTransfer(), 'run-2', [{ id: 'B10', passed: 7, failed: 0 }]);
    events = revise(events, { id: 'B10', contract: { dependsOn: [] }, reason: 'stateless' });
    events = approve(events, 'B10');
    expect(stateOf(events, 'B10')).toMatchObject({ status: 'stale', version: 2, testedVersion: 1 });

    const staleResult: LedgerEvent = {
      type: 'test_results_recorded',
      seq: events.length + 1,
      at: AT,
      actor: 'pacties',
      behaviorId: 'B10',
      version: 1,
      runId: 'run-3',
      passed: 7,
      failed: 0,
    };
    expect(stateOf([...events, staleResult], 'B10')).toMatchObject({ status: 'stale', lastResults: { runId: 'run-2' } });

    events = recordResults(submitTests(events, 'B10'), 'run-4', [{ id: 'B10', passed: 8, failed: 0 }]);
    expect(stateOf(events, 'B10')).toMatchObject({ status: 'passing', version: 2, testedVersion: 2, lastResults: { runId: 'run-4', version: 2 } });
  });

  it('ignores results for an approved behavior that was never submitted', () => {
    const results: LedgerEvent = {
      type: 'test_results_recorded',
      seq: testedTransfer().length + 1,
      at: AT,
      actor: 'pacties',
      behaviorId: 'B9',
      version: 1,
      runId: 'run-5',
      passed: 1,
      failed: 0,
    };
    expect(stateOf([...testedTransfer(), results], 'B9')).toMatchObject({ status: 'approved', lastResults: null });
  });

  it('keeps a contract issue open through a rejected revision and closes it when a revision is approved', () => {
    let events = reportIssue(testedTransfer(), 'B10', 'remaining is undefined when the limit is hit');
    expect(behaviorIn(events, 'B10').openIssues).toEqual([{ version: 1, problem: 'remaining is undefined when the limit is hit', at: expect.any(String) }]);

    events = revise(events, { id: 'B10', contract: { interface: ['POST /transfer { from_id, to_id, amount } -> 429 { remaining: Decimal }'] }, reason: 'tester issue' });
    events = reject(events, 'B10', 'keep the contract as is');
    expect(behaviorIn(events, 'B10').openIssues).toHaveLength(1);

    events = revise(events, { id: 'B10', contract: { interface: ['POST /transfer { from_id, to_id, amount } -> 429 { remaining: Decimal }'] }, reason: 'tester issue' });
    events = approve(events, 'B10');
    expect(behaviorIn(events, 'B10').openIssues).toEqual([]);
  });

  it.each<[string, Partial<LedgerEvent>]>([
    ['tests submitted for a draft', { type: 'tests_submitted', behaviorId: 'B3', version: 1, actor: 'tester' }],
    ['tests submitted for an old version', { type: 'tests_submitted', behaviorId: 'B10', version: 2, actor: 'tester' }],
    ['a contract issue on a draft', { type: 'contract_issue_reported', behaviorId: 'B3', version: 1, actor: 'tester', problem: 'x' }],
  ])('fails on %s', (_, overrides) => {
    const events = testedTransfer();
    const bad = { seq: events.length + 1, at: AT, ...overrides } as LedgerEvent;
    expect(foldLedger([...events, bad]).ok).toBe(false);
  });

  it('fails on a test event targeting a rejected behavior', () => {
    const events = reject(testedTransfer(), 'B4', 'out of scope');
    const bad: LedgerEvent = { type: 'tests_submitted', seq: events.length + 1, at: AT, actor: 'tester', behaviorId: 'B4', version: 1 };
    expect(foldLedger([...events, bad]).ok).toBe(false);
  });
});

describe('foldLedger with run events', () => {
  const finished = (seq: number, runId: string, status: 'completed' | 'blocked' | 'refused' | 'crashed', paths: string[] = []): LedgerEvent => ({
    type: 'test_run_finished',
    seq,
    at: AT,
    actor: 'pacties',
    runId,
    role: 'tester',
    status,
    paths,
  });

  it('keeps the latest run and leaves behaviors untouched', () => {
    const events = proposeMany([], 10);
    const withRuns = [
      ...events,
      finished(11, 'run-a', 'blocked', ['src/__tests__/zahlung é.test.ts']),
      finished(12, 'run-b', 'completed'),
      finished(13, 'run-c', 'refused', ['e2e/b10.spec.ts']),
    ];
    const ledger = ledgerOf(withRuns);
    expect(ledger.lastRun).toEqual({ runId: 'run-c', role: 'tester', status: 'refused', paths: ['e2e/b10.spec.ts'], at: AT });
    expect(ledger.headSeq).toBe(13);
    expect(ledger.behaviors).toEqual(ledgerOf(events).behaviors);
  });

  it('starts with no run', () => {
    expect(ledgerOf(proposeMany([], 2)).lastRun).toBeNull();
  });

  it('still checks seq order for run events', () => {
    expect(foldLedger([...proposeMany([], 2), finished(4, 'run-x', 'completed')]).ok).toBe(false);
  });
});

describe('applyEvent', () => {
  it('returns a new ledger and leaves the input ledger untouched', () => {
    const ledger = ledgerOf(proposeMany([], 2));
    const snapshot = structuredClone(ledger);
    const approval: LedgerEvent = { type: 'behavior_approved', seq: 3, at: AT, actor: 'developer', behaviorId: 'B2', version: 1 };
    const applied = applyEvent(ledger, approval);
    expect(applied.ok && applied.value.behaviors[1]?.status).toBe('approved');
    expect(ledger).toEqual(snapshot);
  });
});
