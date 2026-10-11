import type { Behavior, BehaviorContent, BehaviorFilter, BehaviorId, Ledger, RevisionEffect } from '@/domain/ledger/types';

export function findBehavior(ledger: Ledger, id: BehaviorId): Behavior | undefined {
  return ledger.behaviors.find((behavior) => behavior.id === id);
}

export function awaitsApproval(behavior: Behavior): boolean {
  return behavior.status === 'planned' || behavior.pendingRevision !== null;
}

export function approvableVersion(behavior: Behavior): number | null {
  if (behavior.status === 'planned') {
    return behavior.version;
  }
  return behavior.pendingRevision?.version ?? null;
}

export function latestContent(behavior: Behavior): BehaviorContent {
  return behavior.pendingRevision ?? behavior;
}

export function selectBehaviors(ledger: Ledger, filter: BehaviorFilter): Behavior[] {
  const statuses = filter.statuses ?? [];
  return ledger.behaviors.filter((behavior) => {
    if (statuses.length > 0) {
      return statuses.includes(behavior.status);
    }
    return filter.includeRejected === true || behavior.status !== 'rejected';
  });
}

export function revisionEffect(behavior: Behavior): RevisionEffect {
  return behavior.status === 'planned' ? 'draft_updated' : 'revision_pending';
}
