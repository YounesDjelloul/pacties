import { describe, expect, it } from 'vitest';
import { compareBehaviorIds, nextBehaviorId, parseBehaviorId } from '@/domain/ledger/behavior-ids';
import { EMPTY_LEDGER } from '@/domain/ledger/fold-ledger';
import { approve, ledgerOf, propose, proposeMany, reject } from '@/test-support/ledger-script';
import { refundOutsideWindow } from '@/test-support/behavior-fixtures';
import type { BehaviorId } from '@/domain/ledger/types';

describe('parseBehaviorId', () => {
  it.each([
    ['B7', 'B7'],
    ['b12', 'B12'],
    ['  B10\n', 'B10'],
    ['B007', 'B7'],
  ])('accepts %j as %s', (input, expected) => {
    expect(parseBehaviorId(input)).toEqual({ ok: true, value: expected });
  });

  it.each(['', '   ', 'B', 'B0', 'B000', 'B-3', 'B2.5', '7', 'BB7', 'B 7', 'B1e3', 'B99999999999999999999'])(
    'rejects %j with a hint about the expected format',
    (input) => {
      const result = parseBehaviorId(input);
      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.error).toContain('expected B followed by a positive number');
    },
  );
});

describe('compareBehaviorIds', () => {
  it('orders by number rather than by string', () => {
    const ids: BehaviorId[] = ['B10', 'B2', 'B1', 'B21', 'B3'];
    expect([...ids].sort(compareBehaviorIds)).toEqual(['B1', 'B2', 'B3', 'B10', 'B21']);
  });

  it('treats identical ids as equal', () => {
    expect(compareBehaviorIds('B13', 'B13')).toBe(0);
  });
});

describe('nextBehaviorId', () => {
  it('starts at B1 for an empty ledger', () => {
    expect(nextBehaviorId(EMPTY_LEDGER)).toBe('B1');
  });

  it('crosses from single to double digits by number, not by string order', () => {
    expect(nextBehaviorId(ledgerOf(proposeMany([], 9)))).toBe('B10');
  });

  it('never reuses the id of a rejected behavior, even when it is the highest', () => {
    const events = reject(proposeMany([], 11), 'B11', 'duplicate of B4');
    expect(nextBehaviorId(ledgerOf(events))).toBe('B12');
  });

  it('continues after the highest id regardless of approval state', () => {
    const events = propose(approve(proposeMany([], 3), 'B2'), refundOutsideWindow);
    expect(nextBehaviorId(ledgerOf(events))).toBe('B5');
  });
});
