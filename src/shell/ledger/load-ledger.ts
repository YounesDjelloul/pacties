import { readEvents } from '@/data/event-log';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import { ConflictError, InternalError, NotFoundError, ValidationError, type AppError } from '@/lib/errors';
import type { EventStamp, Ledger, LedgerEvent, LedgerFailure } from '@/domain/ledger/types';
import type { Result } from '@/domain/shared/types';
import type { Project } from '@/domain/project/types';

export type LoadedLedger = {
  events: LedgerEvent[];
  ledger: Ledger;
};

export async function loadLedger(project: Project): Promise<LoadedLedger> {
  const events = await readEvents(project.dir);
  return { events, ledger: unwrapFold(foldLedger(events), project) };
}

export function unwrapFold(result: Result<Ledger>, project: Project): Ledger {
  if (!result.ok) {
    throw new InternalError(`The ledger of ${project.name} is inconsistent: ${result.error}`);
  }
  return result.value;
}

export function stampAfter(ledger: Ledger, now: Date): EventStamp {
  return { lastSeq: ledger.headSeq, at: now.toISOString() };
}

export function toAppError(failure: LedgerFailure): AppError {
  switch (failure.kind) {
    case 'not_found':
      return new NotFoundError(failure.message);
    case 'conflict':
      return new ConflictError(failure.message);
    case 'invalid':
      return new ValidationError(failure.message);
  }
}
