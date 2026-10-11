import { describe, expect, it } from 'vitest';
import { buildReview, pendingReviews } from '@/domain/ledger/review';
import { approve, behaviorIn, ledgerOf, propose, proposeMany, reject, revise, withStatus } from '@/test-support/ledger-script';
import { EMPTY_LEDGER } from '@/domain/ledger/fold-ledger';
import { refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';

describe('buildReview', () => {
  it('reviews a revised draft as a proposal at its latest version', () => {
    const events = revise(propose([], refundOutsideWindow), { id: 'B1', description: 'refund after 31 days is refused', reason: 'shorter' });
    expect(buildReview(behaviorIn(events, 'B1'))).toEqual({
      id: 'B1',
      kind: 'proposal',
      version: 2,
      fromVersion: null,
      description: 'refund after 31 days is refused',
      contract: behaviorIn(events, 'B1').contract,
      reason: null,
      previousDescription: null,
      contractDiff: null,
    });
  });

  it('reviews a pending revision as a diff against the approved version', () => {
    const events = revise(approve(propose([], transferOverDailyLimit), 'B1'), {
      id: 'B1',
      description: 'transfer over daily limit returns 429 with Retry-After',
      contract: { dependsOn: ['get_daily_total(user_id, day: LocalDate) -> Decimal'] },
      reason: 'limit is per calendar day',
    });
    expect(buildReview(behaviorIn(events, 'B1'))).toMatchObject({
      kind: 'revision',
      version: 2,
      fromVersion: 1,
      description: 'transfer over daily limit returns 429 with Retry-After',
      previousDescription: 'transfer over daily limit returns 429',
      reason: 'limit is per calendar day',
      contractDiff: {
        interfaceAdded: [],
        interfaceRemoved: [],
        dependsOnAdded: ['get_daily_total(user_id, day: LocalDate) -> Decimal'],
        dependsOnRemoved: ['get_daily_total(user_id) -> int'],
      },
    });
  });

  it('omits the previous description when a revision only touches the contract', () => {
    const events = revise(approve(propose([], transferOverDailyLimit), 'B1'), { id: 'B1', contract: { dependsOn: [] }, reason: 'stateless' });
    expect(buildReview(behaviorIn(events, 'B1'))?.previousDescription).toBeNull();
  });

  it.each(['approved', 'tested', 'passing', 'stale'] as const)('returns null for a %s behavior with nothing pending', (status) => {
    const ledger = withStatus(approve(propose([], transferOverDailyLimit), 'B1'), 'B1', status);
    expect(buildReview(ledger.behaviors[0]!)).toBeNull();
  });

  it('returns null for a rejected behavior', () => {
    expect(buildReview(behaviorIn(reject(propose([], refundOutsideWindow), 'B1', 'billing'), 'B1'))).toBeNull();
  });
});

describe('pendingReviews', () => {
  it('returns nothing for an empty ledger', () => {
    expect(pendingReviews(EMPTY_LEDGER)).toEqual([]);
  });

  it('lists drafts and pending revisions in numeric id order, skipping settled and rejected behaviors', () => {
    let events = proposeMany([], 9);
    events = approve(events, 'B2', 'B9');
    events = reject(events, 'B3', 'out of scope for billing');
    events = propose(events, transferOverDailyLimit);
    events = revise(events, { id: 'B9', description: 'refund #9 within 14 days restores the balance', reason: 'policy changed' });
    events = approve(events, 'B1', 'B4', 'B5', 'B6', 'B7', 'B8');
    events = revise(events, { id: 'B10', contract: { dependsOn: [] }, reason: 'stateless' });

    expect(pendingReviews(ledgerOf(events)).map((review) => [review.id, review.kind, review.version])).toEqual([
      ['B9', 'revision', 2],
      ['B10', 'proposal', 2],
    ]);
  });

  it('includes a pending revision on a behavior that already has tests', () => {
    const events = revise(approve(propose([], transferOverDailyLimit), 'B1'), { id: 'B1', contract: { dependsOn: [] }, reason: 'stateless' });
    const ledger = withStatus(events, 'B1', 'passing');
    expect(pendingReviews(ledger)).toMatchObject([{ id: 'B1', kind: 'revision', fromVersion: 1, version: 2 }]);
  });
});
