import { appendEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { buildRejectionEvent } from '@/domain/ledger/build-events';
import { findBehavior } from '@/domain/ledger/behavior-queries';
import { applyEvent } from '@/domain/ledger/fold-ledger';
import { loadLedger, stampAfter, toAppError, unwrapFold } from '@/shell/ledger/load-ledger';
import type { Behavior, RejectionRequest } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export async function rejectBehavior(project: Project, request: RejectionRequest, now: Date): Promise<Behavior> {
  return withLedgerLock(project.dir, async (lock) => {
    const { ledger } = await loadLedger(project);
    const event = buildRejectionEvent(ledger, request, stampAfter(ledger, now));
    if (!event.ok) {
      throw toAppError(event.error);
    }

    await appendEvents(project.dir, [event.value], lock);
    return findBehavior(unwrapFold(applyEvent(ledger, event.value), project), request.id)!;
  });
}
