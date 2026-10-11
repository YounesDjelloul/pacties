import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type { BehaviorId, Ledger } from '@/domain/ledger/types';

const BEHAVIOR_ID_INPUT_PATTERN = /^B0*([1-9]\d*)$/iu;

export function parseBehaviorId(input: string): Result<BehaviorId> {
  const match = BEHAVIOR_ID_INPUT_PATTERN.exec(input.trim());
  const digits = match?.[1];
  if (digits === undefined || !Number.isSafeInteger(Number(digits))) {
    return fail(`"${input}" is not a behavior id; expected B followed by a positive number, e.g. B7`);
  }
  const id: BehaviorId = `B${Number(digits)}`;
  return ok(id);
}

export function compareBehaviorIds(left: BehaviorId, right: BehaviorId): number {
  return behaviorNumber(left) - behaviorNumber(right);
}

export function nextBehaviorId(ledger: Ledger): BehaviorId {
  const highest = ledger.behaviors.reduce((max, behavior) => Math.max(max, behaviorNumber(behavior.id)), 0);
  return `B${highest + 1}`;
}

function behaviorNumber(id: BehaviorId): number {
  return Number(id.slice(1));
}
