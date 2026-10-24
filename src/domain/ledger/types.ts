import type { BEHAVIOR_STATUSES, ROLES } from '@/domain/ledger/constants';

export type BehaviorId = `B${number}`;

export type Role = (typeof ROLES)[number];

export type Actor = 'planner' | 'developer' | 'tester' | 'pacties';

export type BehaviorStatus = (typeof BEHAVIOR_STATUSES)[number];

export type Contract = {
  interface: string[];
  dependsOn: string[];
};

export type BehaviorContent = {
  description: string;
  contract: Contract;
};

export type PendingRevision = BehaviorContent & {
  reason: string;
  version: number;
};

export type TestResults = {
  version: number;
  runId: string;
  passed: number;
  failed: number;
};

export type ContractIssue = {
  version: number;
  problem: string;
  at: string;
};

export type Behavior = BehaviorContent & {
  id: BehaviorId;
  version: number;
  status: BehaviorStatus;
  pendingRevision: PendingRevision | null;
  approvedAt: string | null;
  testedVersion: number | null;
  lastResults: TestResults | null;
  openIssues: ContractIssue[];
};

export type Ledger = {
  behaviors: Behavior[];
  headSeq: number;
};

type EventBase = {
  seq: number;
  at: string;
  actor: Actor;
  behaviorId: BehaviorId;
};

export type BehaviorProposedEvent = EventBase & {
  type: 'behavior_proposed';
  content: BehaviorContent;
};

export type BehaviorRevisedEvent = EventBase & {
  type: 'behavior_revised';
  content: BehaviorContent;
  reason: string;
};

export type BehaviorApprovedEvent = EventBase & {
  type: 'behavior_approved';
  version: number;
};

export type BehaviorRejectedEvent = EventBase & {
  type: 'behavior_rejected';
  version: number;
  reason: string;
};

export type TestsSubmittedEvent = EventBase & {
  type: 'tests_submitted';
  version: number;
};

export type TestResultsRecordedEvent = EventBase & {
  type: 'test_results_recorded';
  version: number;
  runId: string;
  passed: number;
  failed: number;
};

export type ContractIssueReportedEvent = EventBase & {
  type: 'contract_issue_reported';
  version: number;
  problem: string;
};

export type LedgerEvent =
  | BehaviorProposedEvent
  | BehaviorRevisedEvent
  | BehaviorApprovedEvent
  | BehaviorRejectedEvent
  | TestsSubmittedEvent
  | TestResultsRecordedEvent
  | ContractIssueReportedEvent;

export type ContractInput = {
  interface: string[];
  dependsOn?: string[];
};

export type ProposalInput = {
  description: string;
  contract: ContractInput;
};

export type RevisionInput = {
  id: BehaviorId;
  description?: string;
  contract?: Partial<ContractInput>;
  reason: string;
};

export type ApprovalRequest = {
  id: BehaviorId;
  version: number;
};

export type RejectionRequest = {
  id: BehaviorId;
  reason: string;
};

export type TestSubmission = {
  requests: ApprovalRequest[];
  taggedIds: BehaviorId[];
};

export type BehaviorTestCounts = {
  id: BehaviorId;
  passed: number;
  failed: number;
};

export type TestRunRecording = {
  runId: string;
  counts: BehaviorTestCounts[];
};

export type RecordedResults = {
  events: TestResultsRecordedEvent[];
  unsubmitted: BehaviorId[];
};

export type ContractIssueInput = {
  id: BehaviorId;
  version: number;
  problem: string;
};

export type EventStamp = {
  lastSeq: number;
  at: string;
};

export type LedgerFailure = {
  kind: 'not_found' | 'invalid' | 'conflict';
  message: string;
};

export type TesterBehaviorView = BehaviorContent & {
  id: BehaviorId;
  version: number;
  status: BehaviorStatus;
  openIssues: ContractIssue[];
};

export type ContractDiff = {
  interfaceAdded: string[];
  interfaceRemoved: string[];
  dependsOnAdded: string[];
  dependsOnRemoved: string[];
};

export type BehaviorChangeKind = 'added' | 'revised' | 'status_changed' | 'revision_pending' | 'issues_changed';

export type BehaviorChange = BehaviorContent & {
  id: BehaviorId;
  change: BehaviorChangeKind;
  fromVersion: number | null;
  version: number;
  fromStatus: BehaviorStatus | null;
  status: BehaviorStatus;
  descriptionChanged: boolean;
  contractDiff: ContractDiff;
  openIssues: ContractIssue[];
};

export type PlannerBehaviorChange = BehaviorChange & {
  pendingRevision: PendingRevision | null;
};

export type Decision = {
  id: BehaviorId;
  decision: 'approved' | 'rejected';
  version: number;
  reason: string | null;
  at: string;
};

type DeltaWindow = {
  fromSeq: number;
  toSeq: number;
  resync: boolean;
};

export type TesterDelta = DeltaWindow & {
  changes: BehaviorChange[];
};

export type TestResultNotice = TestResults & {
  id: BehaviorId;
  at: string;
};

export type ContractIssueNotice = ContractIssue & {
  id: BehaviorId;
};

export type PlannerDelta = DeltaWindow & {
  changes: PlannerBehaviorChange[];
  decisions: Decision[];
  testResults: TestResultNotice[];
  contractIssues: ContractIssueNotice[];
};

export type LedgerSummary = Record<BehaviorStatus, number> & {
  pendingRevisions: number;
};

export type Cursors = Record<Role, number>;

export type BehaviorFilter = {
  statuses?: BehaviorStatus[];
  includeRejected?: boolean;
};

export type RevisionEffect = 'draft_updated' | 'revision_pending';

export type Review = BehaviorContent & {
  id: BehaviorId;
  kind: 'proposal' | 'revision';
  version: number;
  fromVersion: number | null;
  reason: string | null;
  previousDescription: string | null;
  contractDiff: ContractDiff | null;
};
