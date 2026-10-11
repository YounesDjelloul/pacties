import type { Cursors, Role } from '@/domain/ledger/types';

export const INITIAL_CURSORS: Cursors = { planner: 0, tester: 0 };

export function advanceCursor(cursors: Cursors, role: Role, seq: number): Cursors {
  return { ...cursors, [role]: seq };
}
