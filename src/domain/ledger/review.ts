import { diffContracts } from '@/domain/ledger/contract-diff';
import type { Behavior, Ledger, Review } from '@/domain/ledger/types';

export function pendingReviews(ledger: Ledger): Review[] {
  return ledger.behaviors.map(buildReview).filter((review) => review !== null);
}

export function buildReview(behavior: Behavior): Review | null {
  if (behavior.status === 'planned') {
    return {
      id: behavior.id,
      kind: 'proposal',
      version: behavior.version,
      fromVersion: null,
      description: behavior.description,
      contract: behavior.contract,
      reason: null,
      previousDescription: null,
      contractDiff: null,
    };
  }

  const pending = behavior.pendingRevision;
  if (pending === null) {
    return null;
  }

  return {
    id: behavior.id,
    kind: 'revision',
    version: pending.version,
    fromVersion: behavior.version,
    description: pending.description,
    contract: pending.contract,
    reason: pending.reason,
    previousDescription: pending.description === behavior.description ? null : behavior.description,
    contractDiff: diffContracts(behavior.contract, pending.contract),
  };
}
