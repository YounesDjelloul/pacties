import { approvableVersion, findBehavior, latestContent } from '@/domain/ledger/behavior-queries';
import { nextBehaviorId } from '@/domain/ledger/behavior-ids';
import { contentsEqual, normalizeContent, normalizeReason } from '@/domain/ledger/content';
import { fail, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/types';
import type {
  ApprovalRequest,
  Behavior,
  BehaviorApprovedEvent,
  BehaviorId,
  BehaviorProposedEvent,
  BehaviorRejectedEvent,
  BehaviorRevisedEvent,
  ContractIssueInput,
  ContractIssueReportedEvent,
  EventStamp,
  Ledger,
  LedgerFailure,
  ProposalInput,
  RecordedResults,
  RejectionRequest,
  RevisionInput,
  TestRunRecording,
  TestSubmission,
  TestsSubmittedEvent,
} from '@/domain/ledger/types';

export function buildProposalEvent(
  ledger: Ledger,
  input: ProposalInput,
  stamp: EventStamp,
): Result<BehaviorProposedEvent, LedgerFailure> {
  const content = normalizeContent(input.description, input.contract);
  if (!content.ok) {
    return invalid(content.error);
  }

  return ok({
    type: 'behavior_proposed',
    seq: stamp.lastSeq + 1,
    at: stamp.at,
    actor: 'planner',
    behaviorId: nextBehaviorId(ledger),
    content: content.value,
  });
}

export function buildRevisionEvent(
  ledger: Ledger,
  input: RevisionInput,
  stamp: EventStamp,
): Result<BehaviorRevisedEvent, LedgerFailure> {
  const behavior = findBehavior(ledger, input.id);
  if (behavior === undefined) {
    return notFound(input.id);
  }
  if (behavior.status === 'rejected') {
    return invalid(`${behavior.id} was rejected and cannot be revised; propose a new behavior instead`);
  }

  const reason = normalizeReason(input.reason);
  if (!reason.ok) {
    return invalid(reason.error);
  }

  const base = latestContent(behavior);
  const content = normalizeContent(input.description ?? base.description, {
    interface: input.contract?.interface ?? base.contract.interface,
    dependsOn: input.contract?.dependsOn ?? base.contract.dependsOn,
  });
  if (!content.ok) {
    return invalid(content.error);
  }

  if (contentsEqual(content.value, base)) {
    return invalid(`The revision of ${behavior.id} does not change anything once whitespace is normalized`);
  }
  if (behavior.pendingRevision !== null && contentsEqual(content.value, behavior)) {
    return invalid(
      `The revision of ${behavior.id} matches its approved content; ask the developer to run "pacties reject ${behavior.id}" to drop the pending revision instead`,
    );
  }

  return ok({
    type: 'behavior_revised',
    seq: stamp.lastSeq + 1,
    at: stamp.at,
    actor: 'planner',
    behaviorId: behavior.id,
    content: content.value,
    reason: reason.value,
  });
}

export function buildApprovalEvents(
  ledger: Ledger,
  requests: ApprovalRequest[],
  stamp: EventStamp,
): Result<BehaviorApprovedEvent[], LedgerFailure> {
  if (requests.length === 0) {
    return invalid('Name at least one behavior to approve');
  }

  const duplicate = findDuplicate(requests);
  if (duplicate !== undefined) {
    return invalid(`${duplicate.id} is listed more than once`);
  }

  for (const request of requests) {
    const checked = checkApprovable(ledger, request);
    if (!checked.ok) {
      return checked;
    }
  }

  return ok(
    requests.map((request, index) => ({
      type: 'behavior_approved',
      seq: stamp.lastSeq + 1 + index,
      at: stamp.at,
      actor: 'developer',
      behaviorId: request.id,
      version: request.version,
    })),
  );
}

export function buildRejectionEvent(
  ledger: Ledger,
  request: RejectionRequest,
  stamp: EventStamp,
): Result<BehaviorRejectedEvent, LedgerFailure> {
  const behavior = findBehavior(ledger, request.id);
  if (behavior === undefined) {
    return notFound(request.id);
  }

  const version = approvableVersion(behavior);
  if (behavior.status === 'rejected' || version === null) {
    return invalid(`${behavior.id} has nothing awaiting approval, so there is nothing to reject`);
  }

  const reason = normalizeReason(request.reason);
  if (!reason.ok) {
    return invalid(reason.error);
  }

  return ok({
    type: 'behavior_rejected',
    seq: stamp.lastSeq + 1,
    at: stamp.at,
    actor: 'developer',
    behaviorId: behavior.id,
    version,
    reason: reason.value,
  });
}

export function buildTestSubmissionEvents(
  ledger: Ledger,
  submission: TestSubmission,
  stamp: EventStamp,
): Result<TestsSubmittedEvent[], LedgerFailure> {
  const { requests, taggedIds } = submission;
  if (requests.length === 0) {
    return invalid('Name at least one behavior your tests cover');
  }

  const duplicate = findDuplicate(requests);
  if (duplicate !== undefined) {
    return invalid(`${duplicate.id} is listed more than once`);
  }

  for (const request of requests) {
    const settled = checkSettledVersion(ledger, request.id, request.version);
    if (!settled.ok) {
      return settled;
    }
    if (!taggedIds.includes(request.id)) {
      return invalid(`No test is tagged [${request.id}]; put the tag in each test name, e.g. it('[${request.id}] ...')`);
    }
  }

  return ok(
    requests.map((request, index) => ({
      type: 'tests_submitted',
      seq: stamp.lastSeq + 1 + index,
      at: stamp.at,
      actor: 'tester',
      behaviorId: request.id,
      version: request.version,
    })),
  );
}

export function buildTestResultEvents(ledger: Ledger, recording: TestRunRecording, stamp: EventStamp): RecordedResults {
  const submitted = ledger.behaviors.filter(
    (behavior) => behavior.status !== 'rejected' && behavior.testedVersion !== null && behavior.testedVersion === behavior.version,
  );
  const unsubmitted = recording.counts
    .map((count) => count.id)
    .filter((id) => !submitted.some((behavior) => behavior.id === id));

  const events = submitted.map((behavior, index) => {
    const counts = recording.counts.find((count) => count.id === behavior.id);
    return {
      type: 'test_results_recorded' as const,
      seq: stamp.lastSeq + 1 + index,
      at: stamp.at,
      actor: 'pacties' as const,
      behaviorId: behavior.id,
      version: behavior.version,
      runId: recording.runId,
      passed: counts?.passed ?? 0,
      failed: counts?.failed ?? 0,
    };
  });

  return { events, unsubmitted };
}

export function buildContractIssueEvent(
  ledger: Ledger,
  input: ContractIssueInput,
  stamp: EventStamp,
): Result<ContractIssueReportedEvent, LedgerFailure> {
  const settled = checkSettledVersion(ledger, input.id, input.version);
  if (!settled.ok) {
    return settled;
  }

  const problem = normalizeReason(input.problem);
  if (!problem.ok) {
    return invalid('Describe the problem with the contract');
  }

  return ok({
    type: 'contract_issue_reported',
    seq: stamp.lastSeq + 1,
    at: stamp.at,
    actor: 'tester',
    behaviorId: input.id,
    version: input.version,
    problem: problem.value,
  });
}

function checkSettledVersion(ledger: Ledger, id: BehaviorId, version: number): Result<Behavior, LedgerFailure> {
  const behavior = findBehavior(ledger, id);
  if (behavior === undefined || behavior.approvedAt === null || behavior.status === 'rejected') {
    return notFound(id);
  }
  if (behavior.version !== version) {
    return fail({
      kind: 'conflict',
      message: `${id} is now at v${behavior.version}, not v${version}; call get_delta to see what changed`,
    });
  }
  return ok(behavior);
}

function findDuplicate<T extends { id: BehaviorId }>(requests: T[]): T | undefined {
  return requests.find((request, index) => requests.findIndex((other) => other.id === request.id) !== index);
}

function checkApprovable(ledger: Ledger, request: ApprovalRequest): Result<Behavior, LedgerFailure> {
  const behavior = findBehavior(ledger, request.id);
  if (behavior === undefined) {
    return notFound(request.id);
  }

  const version = approvableVersion(behavior);
  if (behavior.status === 'rejected' || version === null) {
    return invalid(`${behavior.id} has nothing awaiting approval`);
  }
  if (version !== request.version) {
    return fail({
      kind: 'conflict',
      message: `${behavior.id} changed to v${version} after v${request.version} was reviewed; review it again before approving`,
    });
  }

  return ok(behavior);
}

function notFound(id: BehaviorId): Result<never, LedgerFailure> {
  return fail({ kind: 'not_found', message: `${id} does not exist` });
}

function invalid(message: string): Result<never, LedgerFailure> {
  return fail({ kind: 'invalid', message });
}
