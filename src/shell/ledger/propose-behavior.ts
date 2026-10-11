import { appendEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { buildProposalEvent } from '@/domain/ledger/build-events';
import { findBehavior } from '@/domain/ledger/behavior-queries';
import { applyEvent } from '@/domain/ledger/fold-ledger';
import { loadLedger, stampAfter, toAppError, unwrapFold } from '@/shell/ledger/load-ledger';
import type { Behavior, ProposalInput } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export async function proposeBehavior(project: Project, input: ProposalInput, now: Date): Promise<Behavior> {
  return withLedgerLock(project.dir, async (lock) => {
    const { ledger } = await loadLedger(project);
    const event = buildProposalEvent(ledger, input, stampAfter(ledger, now));
    if (!event.ok) {
      throw toAppError(event.error);
    }

    await appendEvents(project.dir, [event.value], lock);
    const updated = unwrapFold(applyEvent(ledger, event.value), project);
    return findBehavior(updated, event.value.behaviorId)!;
  });
}
