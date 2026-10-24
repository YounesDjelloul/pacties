import { contentsEqual } from '@/domain/ledger/content';
import { diffContracts } from '@/domain/ledger/contract-diff';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import { testerView } from '@/domain/ledger/tester-view';
import { ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type {
  Behavior,
  BehaviorChange,
  BehaviorChangeKind,
  ContractIssueNotice,
  Decision,
  LedgerEvent,
  PendingRevision,
  PlannerBehaviorChange,
  PlannerDelta,
  TestResultNotice,
  TesterBehaviorView,
  TesterDelta,
} from '@/domain/ledger/types';

type DeltaInputs = {
  before: LedgerEvent[];
  since: LedgerEvent[];
  fromSeq: number;
  toSeq: number;
  resync: boolean;
};

export function computeTesterDelta(events: LedgerEvent[], cursor: number): Result<TesterDelta> {
  const inputs = splitAtCursor(events, cursor);
  const before = foldLedger(inputs.before);
  const after = foldLedger(events);
  if (!before.ok) {
    return before;
  }
  if (!after.ok) {
    return after;
  }

  const previous = testerView(before.value);
  const changes = testerView(after.value)
    .map((current) => describeChange(previous.find((view) => view.id === current.id) ?? null, current))
    .filter((change): change is BehaviorChange => change !== null);

  return ok({ fromSeq: inputs.fromSeq, toSeq: inputs.toSeq, resync: inputs.resync, changes });
}

export function computePlannerDelta(events: LedgerEvent[], cursor: number): Result<PlannerDelta> {
  const inputs = splitAtCursor(events, cursor);
  const before = foldLedger(inputs.before);
  const after = foldLedger(events);
  if (!before.ok) {
    return before;
  }
  if (!after.ok) {
    return after;
  }

  const changes = after.value.behaviors
    .map((current) => describePlannerChange(before.value.behaviors.find((behavior) => behavior.id === current.id) ?? null, current))
    .filter((change): change is PlannerBehaviorChange => change !== null);

  return ok({
    fromSeq: inputs.fromSeq,
    toSeq: inputs.toSeq,
    resync: inputs.resync,
    changes,
    decisions: inputs.since.flatMap(toDecision),
    testResults: inputs.since.flatMap(toTestResultNotice),
    contractIssues: inputs.since.flatMap(toContractIssueNotice),
  });
}

function splitAtCursor(events: LedgerEvent[], cursor: number): DeltaInputs {
  const toSeq = events.at(-1)?.seq ?? 0;
  const resync = !Number.isSafeInteger(cursor) || cursor < 0 || cursor > toSeq;
  const fromSeq = resync ? 0 : cursor;
  return {
    before: events.filter((event) => event.seq <= fromSeq),
    since: events.filter((event) => event.seq > fromSeq),
    fromSeq,
    toSeq,
    resync,
  };
}

function describeChange(previous: TesterBehaviorView | null, current: TesterBehaviorView): BehaviorChange | null {
  const kind = classifyChange(previous, current) ?? (issuesChanged(previous, current) ? 'issues_changed' : null);
  return kind === null ? null : buildChange(kind, previous, current);
}

function describePlannerChange(previous: Behavior | null, current: Behavior): PlannerBehaviorChange | null {
  const kind = classifyChange(previous, current) ?? (pendingRevisionsEqual(previous?.pendingRevision ?? null, current.pendingRevision) ? null : 'revision_pending');
  if (kind === null) {
    return null;
  }
  return { ...buildChange(kind, previous, current), pendingRevision: current.pendingRevision };
}

function classifyChange(previous: TesterBehaviorView | null, current: TesterBehaviorView): BehaviorChangeKind | null {
  if (previous === null) {
    return 'added';
  }
  if (previous.version !== current.version || !contentsEqual(previous, current)) {
    return 'revised';
  }
  if (previous.status !== current.status) {
    return 'status_changed';
  }
  return null;
}

function issuesChanged(previous: TesterBehaviorView | null, current: TesterBehaviorView): boolean {
  return (previous?.openIssues.length ?? 0) !== current.openIssues.length;
}

function buildChange(kind: BehaviorChangeKind, previous: TesterBehaviorView | null, current: TesterBehaviorView): BehaviorChange {
  return {
    id: current.id,
    change: kind,
    fromVersion: previous?.version ?? null,
    version: current.version,
    fromStatus: previous?.status ?? null,
    status: current.status,
    description: current.description,
    contract: current.contract,
    descriptionChanged: previous?.description !== current.description,
    contractDiff: diffContracts(previous?.contract ?? null, current.contract),
    openIssues: current.openIssues,
  };
}

function pendingRevisionsEqual(left: PendingRevision | null, right: PendingRevision | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.version === right.version && left.reason === right.reason && contentsEqual(left, right);
}

function toDecision(event: LedgerEvent): Decision[] {
  switch (event.type) {
    case 'behavior_approved':
      return [{ id: event.behaviorId, decision: 'approved', version: event.version, reason: null, at: event.at }];
    case 'behavior_rejected':
      return [{ id: event.behaviorId, decision: 'rejected', version: event.version, reason: event.reason, at: event.at }];
    default:
      return [];
  }
}

function toTestResultNotice(event: LedgerEvent): TestResultNotice[] {
  if (event.type !== 'test_results_recorded') {
    return [];
  }
  return [{ id: event.behaviorId, version: event.version, runId: event.runId, passed: event.passed, failed: event.failed, at: event.at }];
}

function toContractIssueNotice(event: LedgerEvent): ContractIssueNotice[] {
  if (event.type !== 'contract_issue_reported') {
    return [];
  }
  return [{ id: event.behaviorId, version: event.version, problem: event.problem, at: event.at }];
}
