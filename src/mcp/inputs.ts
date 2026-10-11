import { z } from 'zod';
import { parseBehaviorId } from '@/domain/ledger/behavior-ids';
import { BEHAVIOR_STATUSES } from '@/domain/ledger/constants';
import { ValidationError } from '@/lib/errors';
import type { BehaviorId } from '@/domain/ledger/types';

export const behaviorIdInput = z.string().describe('Behavior id, e.g. "B7"');

export const interfaceInput = z
  .array(z.string())
  .describe('The public API tests will call, one line per entry, layer by layer: exported domain functions, shell boundary functions and entry points, with signatures and errors, e.g. "checkDailyLimit(totals: DailyTotals, amount: Money) -> Result<void, LimitExceeded>" or "POST /transfer { from_id, to_id, amount } -> 429 { error: \\"DAILY_LIMIT_EXCEEDED\\", remaining }"');

export const dependsOnInput = z
  .array(z.string())
  .describe('Collaborators tests may stub, e.g. "get_daily_total(user_id) -> int"');

export const statusInput = z.enum(BEHAVIOR_STATUSES);

export const peekInput = z.boolean().optional().describe('true returns the delta without marking it as seen');

export function toBehaviorId(raw: string): BehaviorId {
  const parsed = parseBehaviorId(raw);
  if (!parsed.ok) {
    throw new ValidationError(parsed.error);
  }
  return parsed.value;
}
