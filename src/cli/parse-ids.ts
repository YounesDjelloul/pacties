import { parseBehaviorId } from '@/domain/ledger/behavior-ids';
import { ValidationError } from '@/lib/errors';
import type { BehaviorId } from '@/domain/ledger/types';

export function parseId(raw: string): BehaviorId {
  const parsed = parseBehaviorId(raw);
  if (!parsed.ok) {
    throw new ValidationError(parsed.error);
  }
  return parsed.value;
}

export function parseIds(rawIds: string[]): BehaviorId[] {
  return rawIds.map(parseId);
}
