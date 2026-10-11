import { BEHAVIOR_STATUSES } from '@/domain/ledger/constants';
import type { BehaviorStatus, Ledger, LedgerSummary } from '@/domain/ledger/types';

export function summarizeLedger(ledger: Ledger): LedgerSummary {
  const emptyCounts = Object.fromEntries(BEHAVIOR_STATUSES.map((status) => [status, 0])) as Record<BehaviorStatus, number>;
  return ledger.behaviors.reduce<LedgerSummary>(
    (summary, behavior) => ({
      ...summary,
      [behavior.status]: summary[behavior.status] + 1,
      pendingRevisions: summary.pendingRevisions + (behavior.pendingRevision === null ? 0 : 1),
    }),
    { ...emptyCounts, pendingRevisions: 0 },
  );
}
