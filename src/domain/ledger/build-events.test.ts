import { describe, expect, it } from 'vitest';
import { buildApprovalEvents, buildProposalEvent, buildRejectionEvent, buildRevisionEvent } from '@/domain/ledger/build-events';
import { EMPTY_LEDGER } from '@/domain/ledger/fold-ledger';
import { approve, behaviorIn, ledgerOf, propose, proposeMany, reject, revise, stampAfter, withStatus } from '@/test-support/ledger-script';
import { accentedPayeeName, refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import type { LedgerEvent } from '@/domain/ledger/types';

const STAMP = { lastSeq: 41, at: '2026-10-25T00:59:59.999Z' };

function withTransferApproved(): LedgerEvent[] {
  return approve(propose(proposeMany([], 9), transferOverDailyLimit), 'B10');
}

describe('buildProposalEvent', () => {
  it('builds a normalized proposal with the next id and seq', () => {
    const result = buildProposalEvent(ledgerOf(proposeMany([], 9)), transferOverDailyLimit, STAMP);
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'behavior_proposed',
        seq: 42,
        at: '2026-10-25T00:59:59.999Z',
        actor: 'planner',
        behaviorId: 'B10',
        content: {
          description: 'transfer over daily limit returns 429',
          contract: {
            interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
            dependsOn: ['get_daily_total(user_id) -> int'],
          },
        },
      },
    });
  });

  it('fails as invalid when the description is blank', () => {
    const result = buildProposalEvent(EMPTY_LEDGER, { ...refundOutsideWindow, description: '\r\n\t' }, STAMP);
    expect(result).toEqual({ ok: false, error: { kind: 'invalid', message: 'Behavior description must not be empty' } });
  });

  it('fails as invalid when the interface only has blank lines', () => {
    const result = buildProposalEvent(EMPTY_LEDGER, { description: 'x', contract: { interface: [' ', '\n'] } }, STAMP);
    expect(result.ok ? null : result.error.kind).toBe('invalid');
  });
});

describe('buildRevisionEvent', () => {
  it('fails as not found for an unknown id', () => {
    const result = buildRevisionEvent(ledgerOf(proposeMany([], 3)), { id: 'B30', description: 'x', reason: 'y' }, STAMP);
    expect(result).toEqual({ ok: false, error: { kind: 'not_found', message: 'B30 does not exist' } });
  });

  it('fails as invalid for a rejected behavior', () => {
    const events = reject(proposeMany([], 4), 'B4', 'out of scope for this sprint');
    const result = buildRevisionEvent(ledgerOf(events), { id: 'B4', description: 'retry', reason: 'retry' }, STAMP);
    expect(result.ok ? null : result.error).toEqual({
      kind: 'invalid',
      message: 'B4 was rejected and cannot be revised; propose a new behavior instead',
    });
  });

  it('fails as invalid when the reason is blank', () => {
    const events = propose([], accentedPayeeName);
    const result = buildRevisionEvent(ledgerOf(events), { id: 'B1', description: 'other', reason: ' \t ' }, STAMP);
    expect(result.ok ? null : result.error.kind).toBe('invalid');
  });

  it('fails as invalid when the revision only differs by whitespace', () => {
    const events = propose([], transferOverDailyLimit);
    const result = buildRevisionEvent(
      ledgerOf(events),
      {
        id: 'B1',
        description: 'transfer   over daily limit returns 429\r\n',
        contract: { interface: ['POST  /transfer {\t from_id, to_id, amount }\r\n', '-> 429 { error: "DAILY_LIMIT_EXCEEDED",   remaining }'] },
        reason: 'reformatted',
      },
      STAMP,
    );
    expect(result.ok ? null : result.error.message).toBe(
      'The revision of B1 does not change anything once whitespace is normalized',
    );
  });

  it('fails as invalid when the revision changes no field at all', () => {
    const events = propose([], accentedPayeeName);
    const result = buildRevisionEvent(ledgerOf(events), { id: 'B1', reason: 'nothing really' }, STAMP);
    expect(result.ok ? null : result.error.kind).toBe('invalid');
  });

  it('merges a partial contract change into the current content', () => {
    const events = propose([], transferOverDailyLimit);
    const result = buildRevisionEvent(
      ledgerOf(events),
      { id: 'B1', contract: { dependsOn: ['get_daily_total(user_id, day: LocalDate) -> Decimal'] }, reason: 'limit is per calendar day' },
      STAMP,
    );
    expect(result.ok && result.value.content).toEqual({
      description: 'transfer over daily limit returns 429',
      contract: {
        interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
        dependsOn: ['get_daily_total(user_id, day: LocalDate) -> Decimal'],
      },
    });
  });

  it('can clear dependsOn with an explicit empty list', () => {
    const events = propose([], transferOverDailyLimit);
    const result = buildRevisionEvent(ledgerOf(events), { id: 'B1', contract: { dependsOn: [] }, reason: 'limit now comes from the request' }, STAMP);
    expect(result.ok && result.value.content.contract.dependsOn).toEqual([]);
  });

  it('bases the revision on the pending revision when one exists', () => {
    const events = revise(withTransferApproved(), { id: 'B10', description: 'transfer over daily limit returns 429 with retry_after', reason: 'clients need a retry hint' });
    const result = buildRevisionEvent(
      ledgerOf(events),
      { id: 'B10', contract: { dependsOn: [] }, reason: 'drop dependency' },
      stampAfter(events),
    );
    expect(result.ok && result.value.content.description).toBe('transfer over daily limit returns 429 with retry_after');
  });

  it('fails as invalid when a pending revision would be reverted to the approved content', () => {
    const events = revise(withTransferApproved(), { id: 'B10', description: 'transfer over daily limit returns 409', reason: 'conflict code' });
    const result = buildRevisionEvent(
      ledgerOf(events),
      { id: 'B10', description: 'transfer over daily limit returns 429', reason: 'back to 429' },
      stampAfter(events),
    );
    expect(result.ok ? null : result.error.message).toBe(
      'The revision of B10 matches its approved content; ask the developer to run "pacties reject B10" to drop the pending revision instead',
    );
  });
});

describe('buildApprovalEvents', () => {
  it('builds one event per request with consecutive seqs', () => {
    const events = proposeMany([], 11);
    const result = buildApprovalEvents(ledgerOf(events), [{ id: 'B11', version: 1 }, { id: 'B2', version: 1 }], STAMP);
    expect(result.ok && result.value.map(({ behaviorId, seq, version, actor }) => ({ behaviorId, seq, version, actor }))).toEqual([
      { behaviorId: 'B11', seq: 42, version: 1, actor: 'developer' },
      { behaviorId: 'B2', seq: 43, version: 1, actor: 'developer' },
    ]);
  });

  it('approves the pending revision version of an approved behavior', () => {
    const events = revise(withTransferApproved(), { id: 'B10', description: 'transfer over daily limit returns 429 and logs', reason: 'audit' });
    const result = buildApprovalEvents(ledgerOf(events), [{ id: 'B10', version: 2 }], STAMP);
    expect(result.ok).toBe(true);
  });

  it('fails as invalid for an empty request list', () => {
    expect(buildApprovalEvents(ledgerOf(proposeMany([], 2)), [], STAMP)).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'Name at least one behavior to approve' },
    });
  });

  it('fails as invalid when an id is listed twice', () => {
    const result = buildApprovalEvents(ledgerOf(proposeMany([], 3)), [{ id: 'B3', version: 1 }, { id: 'B1', version: 1 }, { id: 'B3', version: 1 }], STAMP);
    expect(result.ok ? null : result.error).toEqual({ kind: 'invalid', message: 'B3 is listed more than once' });
  });

  it('fails the whole batch as not found when one id is unknown', () => {
    const result = buildApprovalEvents(ledgerOf(proposeMany([], 3)), [{ id: 'B1', version: 1 }, { id: 'B13', version: 1 }], STAMP);
    expect(result.ok ? null : result.error).toEqual({ kind: 'not_found', message: 'B13 does not exist' });
  });

  it('fails as invalid for an approved behavior with nothing pending', () => {
    const result = buildApprovalEvents(ledgerOf(withTransferApproved()), [{ id: 'B10', version: 1 }], STAMP);
    expect(result.ok ? null : result.error).toEqual({ kind: 'invalid', message: 'B10 has nothing awaiting approval' });
  });

  it('fails as invalid for a rejected behavior', () => {
    const events = reject(proposeMany([], 2), 'B2', 'superseded');
    const result = buildApprovalEvents(ledgerOf(events), [{ id: 'B2', version: 1 }], STAMP);
    expect(result.ok ? null : result.error.kind).toBe('invalid');
  });

  it('fails as a conflict when the draft was revised after review', () => {
    const events = revise(propose([], transferOverDailyLimit), { id: 'B1', description: 'transfer over daily limit returns 429 immediately', reason: 'no queueing' });
    const result = buildApprovalEvents(ledgerOf(events), [{ id: 'B1', version: 1 }], STAMP);
    expect(result.ok ? null : result.error).toEqual({
      kind: 'conflict',
      message: 'B1 changed to v2 after v1 was reviewed; review it again before approving',
    });
  });

  it('fails as a conflict when asked for the current approved version instead of the pending one', () => {
    const events = revise(withTransferApproved(), { id: 'B10', description: 'transfer over limit returns 429', reason: 'shorter' });
    const result = buildApprovalEvents(ledgerOf(events), [{ id: 'B10', version: 1 }], STAMP);
    expect(result.ok ? null : result.error.kind).toBe('conflict');
  });
});

describe('buildRejectionEvent', () => {
  it('rejects a planned behavior at its draft version', () => {
    const events = revise(proposeMany([], 2), { id: 'B2', description: 'refund #2 reverses the fee too', reason: 'fees' });
    const result = buildRejectionEvent(ledgerOf(events), { id: 'B2', reason: '  belongs to\nbilling team ' }, STAMP);
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'behavior_rejected',
        seq: 42,
        at: STAMP.at,
        actor: 'developer',
        behaviorId: 'B2',
        version: 2,
        reason: 'belongs to billing team',
      },
    });
  });

  it('rejects a pending revision at the pending version', () => {
    const events = revise(withTransferApproved(), { id: 'B10', description: 'transfer over limit returns 403', reason: 'security' });
    const result = buildRejectionEvent(ledgerOf(events), { id: 'B10', reason: '429 is what clients expect' }, STAMP);
    expect(result.ok && result.value.version).toBe(2);
  });

  it('fails as not found for an unknown id', () => {
    expect(buildRejectionEvent(EMPTY_LEDGER, { id: 'B1', reason: 'x' }, STAMP).ok).toBe(false);
  });

  it.each(['approved', 'tested', 'passing', 'stale'] as const)('fails as invalid for a %s behavior with nothing pending', (status) => {
    const ledger = withStatus(withTransferApproved(), 'B10', status);
    const result = buildRejectionEvent(ledger, { id: 'B10', reason: 'x' }, STAMP);
    expect(result.ok ? null : result.error).toEqual({
      kind: 'invalid',
      message: 'B10 has nothing awaiting approval, so there is nothing to reject',
    });
  });

  it('fails as invalid for an already rejected behavior', () => {
    const events = reject(proposeMany([], 1), 'B1', 'dup');
    expect(buildRejectionEvent(ledgerOf(events), { id: 'B1', reason: 'again' }, STAMP).ok).toBe(false);
  });

  it('fails as invalid when the reason is blank', () => {
    const result = buildRejectionEvent(ledgerOf(proposeMany([], 1)), { id: 'B1', reason: '\r\n' }, STAMP);
    expect(result.ok ? null : result.error.kind).toBe('invalid');
  });

  it('leaves the behavior untouched in the source events', () => {
    const events = proposeMany([], 1);
    buildRejectionEvent(ledgerOf(events), { id: 'B1', reason: 'x' }, STAMP);
    expect(behaviorIn(events, 'B1').status).toBe('planned');
  });
});
