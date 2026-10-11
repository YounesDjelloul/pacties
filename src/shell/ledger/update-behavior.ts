import { appendEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { buildRevisionEvent } from '@/domain/ledger/build-events';
import { findBehavior, revisionEffect } from '@/domain/ledger/behavior-queries';
import { applyEvent } from '@/domain/ledger/fold-ledger';
import { loadLedger, stampAfter, toAppError, unwrapFold } from '@/shell/ledger/load-ledger';
import type { Behavior, RevisionEffect, RevisionInput } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export type UpdateOutcome = {
  behavior: Behavior;
  effect: RevisionEffect;
};

export async function updateBehavior(project: Project, input: RevisionInput, now: Date): Promise<UpdateOutcome> {
  return withLedgerLock(project.dir, async (lock) => {
    const { ledger } = await loadLedger(project);
    const event = buildRevisionEvent(ledger, input, stampAfter(ledger, now));
    if (!event.ok) {
      throw toAppError(event.error);
    }

    await appendEvents(project.dir, [event.value], lock);
    const behavior = findBehavior(unwrapFold(applyEvent(ledger, event.value), project), input.id)!;
    return { behavior, effect: revisionEffect(behavior) };
  });
}
