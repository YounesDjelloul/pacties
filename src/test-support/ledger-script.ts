import { buildApprovalEvents, buildProposalEvent, buildRejectionEvent, buildRevisionEvent } from '@/domain/ledger/build-events';
import { approvableVersion, findBehavior } from '@/domain/ledger/behavior-queries';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import type { Result } from '@/domain/shared/types';
import type {
  Behavior,
  BehaviorId,
  EventStamp,
  Ledger,
  LedgerEvent,
  ProposalInput,
  RevisionInput,
} from '@/domain/ledger/types';

const BASE_TIME = Date.parse('2026-03-29T00:59:58.137Z');

export function stampAfter(events: LedgerEvent[]): EventStamp {
  const lastSeq = events.at(-1)?.seq ?? 0;
  return { lastSeq, at: new Date(BASE_TIME + lastSeq * 1_003).toISOString() };
}

export function ledgerOf(events: LedgerEvent[]): Ledger {
  return unwrap(foldLedger(events));
}

export function behaviorIn(events: LedgerEvent[], id: BehaviorId): Behavior {
  const behavior = findBehavior(ledgerOf(events), id);
  if (behavior === undefined) {
    throw new Error(`test script: ${id} missing`);
  }
  return behavior;
}

export function propose(events: LedgerEvent[], input: ProposalInput): LedgerEvent[] {
  return [...events, unwrap(buildProposalEvent(ledgerOf(events), input, stampAfter(events)))];
}

export function revise(events: LedgerEvent[], input: RevisionInput): LedgerEvent[] {
  return [...events, unwrap(buildRevisionEvent(ledgerOf(events), input, stampAfter(events)))];
}

export function approve(events: LedgerEvent[], ...ids: BehaviorId[]): LedgerEvent[] {
  const ledger = ledgerOf(events);
  const requests = ids.map((id) => ({ id, version: approvableVersionOf(ledger, id) }));
  return [...events, ...unwrap(buildApprovalEvents(ledger, requests, stampAfter(events)))];
}

export function reject(events: LedgerEvent[], id: BehaviorId, reason: string): LedgerEvent[] {
  return [...events, unwrap(buildRejectionEvent(ledgerOf(events), { id, reason }, stampAfter(events)))];
}

export function proposeMany(events: LedgerEvent[], count: number): LedgerEvent[] {
  return Array.from({ length: count }).reduce<LedgerEvent[]>(
    (acc, _, index) =>
      propose(acc, {
        description: `refund #${index + 1} within 30 days restores the balance`,
        contract: { interface: [`POST /refunds/${index + 1} { reason }  ->  202`] },
      }),
    events,
  );
}

export function withStatus(events: LedgerEvent[], id: BehaviorId, status: Behavior['status']): Ledger {
  const ledger = ledgerOf(events);
  return {
    ...ledger,
    behaviors: ledger.behaviors.map((behavior) => (behavior.id === id ? { ...behavior, status } : behavior)),
  };
}

function approvableVersionOf(ledger: Ledger, id: BehaviorId): number {
  const behavior = findBehavior(ledger, id);
  const version = behavior === undefined ? null : approvableVersion(behavior);
  if (version === null) {
    throw new Error(`test script: ${id} is not approvable`);
  }
  return version;
}

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`test script: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}
