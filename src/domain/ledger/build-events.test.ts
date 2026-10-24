import { describe, expect, it } from 'vitest';
import {
  buildApprovalEvents,
  buildContractIssueEvent,
  buildProposalEvent,
  buildRejectionEvent,
  buildRevisionEvent,
  buildTestResultEvents,
  buildTestSubmissionEvents,
} from '@/domain/ledger/build-events';
import { EMPTY_LEDGER } from '@/domain/ledger/fold-ledger';
import { approve, behaviorIn, ledgerOf, propose, proposeMany, reject, revise, stampAfter, submitTests, withStatus } from '@/test-support/ledger-script';
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

describe('buildTestSubmissionEvents', () => {
  it('builds one tester event per covered behavior with consecutive seqs', () => {
    const events = approve(withTransferApproved(), 'B2', 'B9');
    const built = buildTestSubmissionEvents(
      ledgerOf(events),
      { requests: [{ id: 'B10', version: 1 }, { id: 'B9', version: 1 }], taggedIds: ['B9', 'B10', 'B2'] },
      STAMP,
    );
    expect(built).toEqual({
      ok: true,
      value: [
        { type: 'tests_submitted', seq: 42, at: STAMP.at, actor: 'tester', behaviorId: 'B10', version: 1 },
        { type: 'tests_submitted', seq: 43, at: STAMP.at, actor: 'tester', behaviorId: 'B9', version: 1 },
      ],
    });
  });

  it('fails as invalid for an empty request list', () => {
    expect(buildTestSubmissionEvents(ledgerOf(withTransferApproved()), { requests: [], taggedIds: ['B10'] }, STAMP)).toMatchObject({
      ok: false,
      error: { kind: 'invalid' },
    });
  });

  it('fails as invalid when an id is listed twice', () => {
    const requests = [{ id: 'B10' as const, version: 1 }, { id: 'B10' as const, version: 1 }];
    expect(buildTestSubmissionEvents(ledgerOf(withTransferApproved()), { requests, taggedIds: ['B10'] }, STAMP)).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'B10 is listed more than once' },
    });
  });

  it('answers a draft with the same not found as an unknown id, so drafts never leak', () => {
    const ledger = ledgerOf(withTransferApproved());
    const draft = buildTestSubmissionEvents(ledger, { requests: [{ id: 'B3', version: 1 }], taggedIds: ['B3'] }, STAMP);
    const unknown = buildTestSubmissionEvents(ledger, { requests: [{ id: 'B11', version: 1 }], taggedIds: ['B11'] }, STAMP);
    expect(draft).toEqual({ ok: false, error: { kind: 'not_found', message: 'B3 does not exist' } });
    expect(unknown).toEqual({ ok: false, error: { kind: 'not_found', message: 'B11 does not exist' } });
  });

  it('answers a rejected behavior with not found', () => {
    const events = reject(withTransferApproved(), 'B4', 'duplicate of B10');
    expect(buildTestSubmissionEvents(ledgerOf(events), { requests: [{ id: 'B4', version: 1 }], taggedIds: ['B4'] }, STAMP)).toMatchObject({
      ok: false,
      error: { kind: 'not_found' },
    });
  });

  it('fails as a conflict when the tests target a version older than the approved one', () => {
    let events = revise(withTransferApproved(), { id: 'B10', contract: { dependsOn: [] }, reason: 'stateless' });
    events = approve(events, 'B10');
    expect(buildTestSubmissionEvents(ledgerOf(events), { requests: [{ id: 'B10', version: 1 }], taggedIds: ['B10'] }, STAMP)).toEqual({
      ok: false,
      error: { kind: 'conflict', message: 'B10 is now at v2, not v1; call get_delta to see what changed' },
    });
  });

  it('accepts the approved version while a newer revision is still pending', () => {
    const events = revise(withTransferApproved(), { id: 'B10', contract: { dependsOn: [] }, reason: 'stateless' });
    const built = buildTestSubmissionEvents(ledgerOf(events), { requests: [{ id: 'B10', version: 1 }], taggedIds: ['B10'] }, STAMP);
    expect(built.ok).toBe(true);
  });

  it('fails the whole batch as invalid when one behavior has no tagged test', () => {
    const events = approve(withTransferApproved(), 'B1');
    const built = buildTestSubmissionEvents(
      ledgerOf(events),
      { requests: [{ id: 'B10', version: 1 }, { id: 'B1', version: 1 }], taggedIds: ['B10', 'B11'] },
      STAMP,
    );
    expect(built).toEqual({
      ok: false,
      error: { kind: 'invalid', message: "No test is tagged [B1]; put the tag in each test name, e.g. it('[B1] ...')" },
    });
  });
});

describe('buildTestResultEvents', () => {
  it('records results for every behavior submitted at its current version, counting a missing one as zero', () => {
    let events = approve(withTransferApproved(), 'B2', 'B9');
    events = submitTests(events, 'B9', 'B10', 'B2');
    const recorded = buildTestResultEvents(
      ledgerOf(events),
      { runId: 'run-7', counts: [{ id: 'B10', passed: 3, failed: 1 }, { id: 'B9', passed: 12, failed: 0 }] },
      STAMP,
    );
    expect(recorded.unsubmitted).toEqual([]);
    expect(recorded.events.map((event) => [event.seq, event.behaviorId, event.version, event.passed, event.failed])).toEqual([
      [42, 'B2', 1, 0, 0],
      [43, 'B9', 1, 12, 0],
      [44, 'B10', 1, 3, 1],
    ]);
    expect(recorded.events.every((event) => event.actor === 'pacties' && event.runId === 'run-7')).toBe(true);
  });

  it('reports tagged behaviors that were never submitted, or whose tests target an older version, without recording them', () => {
    let events = approve(withTransferApproved(), 'B2');
    events = submitTests(events, 'B10', 'B2');
    events = revise(events, { id: 'B10', contract: { dependsOn: [] }, reason: 'stateless' });
    events = approve(events, 'B10');
    const recorded = buildTestResultEvents(
      ledgerOf(events),
      { runId: 'run-8', counts: [{ id: 'B10', passed: 4, failed: 0 }, { id: 'B5', passed: 1, failed: 0 }, { id: 'B2', passed: 2, failed: 0 }] },
      STAMP,
    );
    expect(recorded.events.map((event) => event.behaviorId)).toEqual(['B2']);
    expect(recorded.unsubmitted).toEqual(['B10', 'B5']);
  });

  it('records nothing on a ledger without submitted tests', () => {
    expect(buildTestResultEvents(ledgerOf(withTransferApproved()), { runId: 'run-1', counts: [] }, STAMP)).toEqual({ events: [], unsubmitted: [] });
  });
});

describe('buildContractIssueEvent', () => {
  it('builds a normalized tester issue at the approved version', () => {
    const built = buildContractIssueEvent(
      ledgerOf(withTransferApproved()),
      { id: 'B10', version: 1, problem: '  the contract never says\r\nwhat "remaining" is when the limit is hit  ' },
      STAMP,
    );
    expect(built).toEqual({
      ok: true,
      value: {
        type: 'contract_issue_reported',
        seq: 42,
        at: STAMP.at,
        actor: 'tester',
        behaviorId: 'B10',
        version: 1,
        problem: 'the contract never says what "remaining" is when the limit is hit',
      },
    });
  });

  it('fails as invalid when the problem is blank', () => {
    expect(buildContractIssueEvent(ledgerOf(withTransferApproved()), { id: 'B10', version: 1, problem: ' \r\n\t' }, STAMP)).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'Describe the problem with the contract' },
    });
  });

  it('answers a draft with not found', () => {
    expect(buildContractIssueEvent(ledgerOf(withTransferApproved()), { id: 'B7', version: 1, problem: 'unclear' }, STAMP)).toMatchObject({
      ok: false,
      error: { kind: 'not_found', message: 'B7 does not exist' },
    });
  });

  it('fails as a conflict for a version other than the approved one', () => {
    const events = revise(withTransferApproved(), { id: 'B10', contract: { dependsOn: [] }, reason: 'stateless' });
    expect(buildContractIssueEvent(ledgerOf(events), { id: 'B10', version: 2, problem: 'unclear' }, STAMP)).toMatchObject({
      ok: false,
      error: { kind: 'conflict' },
    });
  });
});
