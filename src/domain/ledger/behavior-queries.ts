import type { Behavior, BehaviorContent, BehaviorId, Ledger } from '@/domain/ledger/types';

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
