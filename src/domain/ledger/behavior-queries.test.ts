import { describe, expect, it } from 'vitest';
import { approvableVersion, awaitsApproval, findBehavior, latestContent, revisionEffect, selectBehaviors } from '@/domain/ledger/behavior-queries';
import { approve, behaviorIn, ledgerOf, propose, proposeMany, reject, revise, withStatus } from '@/test-support/ledger-script';
import { transferOverDailyLimit } from '@/test-support/behavior-fixtures';

const approvedWithPending = () =>
  revise(approve(propose(proposeMany([], 10), transferOverDailyLimit), 'B11'), {
    id: 'B11',
    description: 'transfer over daily limit returns 429 and Retry-After',
    reason: 'clients need a retry hint',
  });

describe('findBehavior', () => {
  it('finds B10 without confusing it with B1', () => {
    expect(findBehavior(ledgerOf(proposeMany([], 10)), 'B10')?.description).toBe('refund #10 within 30 days restores the balance');
  });

  it('returns undefined for an unknown id', () => {
    expect(findBehavior(ledgerOf(proposeMany([], 3)), 'B4')).toBeUndefined();
  });
});

describe('awaitsApproval', () => {
  it('is true for a planned draft', () => {
    expect(awaitsApproval(behaviorIn(proposeMany([], 1), 'B1'))).toBe(true);
  });

  it('is true for an approved behavior with a pending revision', () => {
    expect(awaitsApproval(behaviorIn(approvedWithPending(), 'B11'))).toBe(true);
  });

  it.each(['approved', 'tested', 'passing', 'stale'] as const)('is false for a %s behavior with nothing pending', (status) => {
    const ledger = withStatus(approve(proposeMany([], 1), 'B1'), 'B1', status);
    expect(awaitsApproval(ledger.behaviors[0]!)).toBe(false);
  });

  it('is false for a rejected behavior', () => {
    expect(awaitsApproval(behaviorIn(reject(proposeMany([], 1), 'B1', 'dup'), 'B1'))).toBe(false);
  });
});

describe('approvableVersion', () => {
  it('is the draft version for a planned behavior revised twice', () => {
    let events = proposeMany([], 1);
    events = revise(events, { id: 'B1', description: 'refund within 30 days', reason: 'a' });
    events = revise(events, { id: 'B1', description: 'refund within 30 calendar days', reason: 'b' });
    expect(approvableVersion(behaviorIn(events, 'B1'))).toBe(3);
  });

  it('is the pending version for an approved behavior under revision', () => {
    expect(approvableVersion(behaviorIn(approvedWithPending(), 'B11'))).toBe(2);
  });

  it('is null when nothing awaits approval', () => {
    expect(approvableVersion(behaviorIn(approve(proposeMany([], 1), 'B1'), 'B1'))).toBeNull();
  });
});

describe('latestContent', () => {
  it('prefers the pending revision content', () => {
    expect(latestContent(behaviorIn(approvedWithPending(), 'B11')).description).toBe(
      'transfer over daily limit returns 429 and Retry-After',
    );
  });

  it('falls back to the current content', () => {
    expect(latestContent(behaviorIn(propose([], transferOverDailyLimit), 'B1')).description).toBe(
      'transfer over daily limit returns 429',
    );
  });
});

describe('selectBehaviors', () => {
  const events = () => revise(reject(approve(proposeMany([], 12), 'B2', 'B10'), 'B11', 'dup'), { id: 'B10', description: 'refund #10 in 14 days', reason: 'policy' });

  it('hides rejected behaviors by default and keeps numeric order', () => {
    const ids = selectBehaviors(ledgerOf(events()), {}).map((behavior) => behavior.id);
    expect(ids).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12']);
  });

  it('includes rejected behaviors when asked', () => {
    expect(selectBehaviors(ledgerOf(events()), { includeRejected: true })).toHaveLength(12);
  });

  it('filters by several statuses', () => {
    const ids = selectBehaviors(ledgerOf(events()), { statuses: ['approved', 'rejected'] }).map((behavior) => behavior.id);
    expect(ids).toEqual(['B2', 'B10', 'B11']);
  });

  it('treats an empty status list as no status filter', () => {
    expect(selectBehaviors(ledgerOf(events()), { statuses: [] })).toHaveLength(11);
  });

  it('returns nothing when no behavior has the requested status', () => {
    expect(selectBehaviors(ledgerOf(events()), { statuses: ['passing'] })).toEqual([]);
  });
});

describe('revisionEffect', () => {
  it('is draft_updated for a planned behavior', () => {
    expect(revisionEffect(behaviorIn(proposeMany([], 1), 'B1'))).toBe('draft_updated');
  });

  it.each(['approved', 'tested', 'passing', 'stale'] as const)('is revision_pending for a %s behavior', (status) => {
    const ledger = withStatus(approve(proposeMany([], 1), 'B1'), 'B1', status);
    expect(revisionEffect(ledger.behaviors[0]!)).toBe('revision_pending');
  });
});
