import { describe, expect, it } from 'vitest';
import { INITIAL_CURSORS, advanceCursor } from '@/domain/ledger/cursors';

describe('advanceCursor', () => {
  it('moves only the given role and leaves the input untouched', () => {
    const cursors = { planner: 17, tester: 9 };
    expect(advanceCursor(cursors, 'tester', 23)).toEqual({ planner: 17, tester: 23 });
    expect(cursors).toEqual({ planner: 17, tester: 9 });
  });

  it('starts every role at zero', () => {
    expect(INITIAL_CURSORS).toEqual({ planner: 0, tester: 0 });
  });
});
