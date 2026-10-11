import { appendEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { buildApprovalEvents } from '@/domain/ledger/build-events';
import { findBehavior } from '@/domain/ledger/behavior-queries';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import { loadLedger, stampAfter, toAppError, unwrapFold } from '@/shell/ledger/load-ledger';
import type { ApprovalRequest, Behavior } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export async function approveBehaviors(project: Project, requests: ApprovalRequest[], now: Date): Promise<Behavior[]> {
  return withLedgerLock(project.dir, async (lock) => {
    const { events, ledger } = await loadLedger(project);
    const approvals = buildApprovalEvents(ledger, requests, stampAfter(ledger, now));
    if (!approvals.ok) {
      throw toAppError(approvals.error);
    }

    await appendEvents(project.dir, approvals.value, lock);
    const updated = unwrapFold(foldLedger([...events, ...approvals.value]), project);
    return requests.map((request) => findBehavior(updated, request.id)!);
  });
}
