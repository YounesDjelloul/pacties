import { STATUSES_WITH_TESTS, FIRST_VERSION } from '@/domain/ledger/constants';
import { findBehavior } from '@/domain/ledger/behavior-queries';
import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type {
  Behavior,
  BehaviorApprovedEvent,
  BehaviorProposedEvent,
  BehaviorRejectedEvent,
  BehaviorRevisedEvent,
  BehaviorStatus,
  Ledger,
  LedgerEvent,
} from '@/domain/ledger/types';

export const EMPTY_LEDGER: Ledger = { behaviors: [], headSeq: 0 };

export function foldLedger(events: LedgerEvent[]): Result<Ledger> {
  let ledger = EMPTY_LEDGER;
  for (const event of events) {
    const applied = applyEvent(ledger, event);
    if (!applied.ok) {
      return applied;
    }
    ledger = applied.value;
  }
  return ok(ledger);
}

export function applyEvent(ledger: Ledger, event: LedgerEvent): Result<Ledger> {
  if (event.seq !== ledger.headSeq + 1) {
    return fail(`Event log is out of order: expected seq ${ledger.headSeq + 1} but found ${event.seq}`);
  }

  if (event.type === 'behavior_proposed') {
    return applyProposal(ledger, event);
  }

  const behavior = findBehavior(ledger, event.behaviorId);
  if (behavior === undefined) {
    return fail(`Event ${event.seq} refers to ${event.behaviorId}, which was never proposed`);
  }

  const updated = applyToBehavior(behavior, event);
  if (!updated.ok) {
    return updated;
  }

  return ok({
    behaviors: ledger.behaviors.map((existing) => (existing.id === behavior.id ? updated.value : existing)),
    headSeq: event.seq,
  });
}

function applyProposal(ledger: Ledger, event: BehaviorProposedEvent): Result<Ledger> {
  if (findBehavior(ledger, event.behaviorId) !== undefined) {
    return fail(`Event ${event.seq} proposes ${event.behaviorId}, which already exists`);
  }

  const behavior: Behavior = {
    ...event.content,
    id: event.behaviorId,
    version: FIRST_VERSION,
    status: 'planned',
    pendingRevision: null,
    approvedAt: null,
  };

  return ok({ behaviors: [...ledger.behaviors, behavior], headSeq: event.seq });
}

function applyToBehavior(
  behavior: Behavior,
  event: BehaviorRevisedEvent | BehaviorApprovedEvent | BehaviorRejectedEvent,
): Result<Behavior> {
  if (behavior.status === 'rejected') {
    return fail(`Event ${event.seq} changes ${behavior.id}, which was rejected`);
  }

  switch (event.type) {
    case 'behavior_revised':
      return ok(applyRevision(behavior, event));
    case 'behavior_approved':
      return applyApproval(behavior, event);
    case 'behavior_rejected':
      return applyRejection(behavior, event);
  }
}

function applyRevision(behavior: Behavior, event: BehaviorRevisedEvent): Behavior {
  if (behavior.status === 'planned') {
    return { ...behavior, ...event.content, version: behavior.version + 1 };
  }

  const pendingVersion = behavior.pendingRevision?.version ?? behavior.version + 1;
  return {
    ...behavior,
    pendingRevision: { ...event.content, reason: event.reason, version: pendingVersion },
  };
}

function applyApproval(behavior: Behavior, event: BehaviorApprovedEvent): Result<Behavior> {
  if (behavior.status === 'planned') {
    if (event.version !== behavior.version) {
      return fail(`Event ${event.seq} approves ${behavior.id} v${event.version}, but the draft is v${behavior.version}`);
    }
    return ok({ ...behavior, status: 'approved', approvedAt: event.at });
  }

  const pending = behavior.pendingRevision;
  if (pending === null || pending.version !== event.version) {
    return fail(`Event ${event.seq} approves ${behavior.id} v${event.version}, but no such revision is pending`);
  }

  return ok({
    ...behavior,
    description: pending.description,
    contract: pending.contract,
    version: pending.version,
    status: statusAfterRevisionApproval(behavior.status),
    pendingRevision: null,
    approvedAt: event.at,
  });
}

function applyRejection(behavior: Behavior, event: BehaviorRejectedEvent): Result<Behavior> {
  if (behavior.status === 'planned') {
    return ok({ ...behavior, status: 'rejected' });
  }

  if (behavior.pendingRevision === null) {
    return fail(`Event ${event.seq} rejects ${behavior.id}, but nothing is awaiting approval`);
  }

  return ok({ ...behavior, pendingRevision: null });
}

function statusAfterRevisionApproval(status: BehaviorStatus): BehaviorStatus {
  return (STATUSES_WITH_TESTS as readonly BehaviorStatus[]).includes(status) ? 'stale' : status;
}
