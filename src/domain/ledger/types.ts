import type { BEHAVIOR_STATUSES, ROLES } from '@/domain/ledger/constants';

export type BehaviorId = `B${number}`;

export type Role = (typeof ROLES)[number];

export type Actor = 'planner' | 'developer' | 'pacties';

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

export type Behavior = BehaviorContent & {
  id: BehaviorId;
  version: number;
  status: BehaviorStatus;
  pendingRevision: PendingRevision | null;
  approvedAt: string | null;
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

export type LedgerEvent =
  | BehaviorProposedEvent
  | BehaviorRevisedEvent
  | BehaviorApprovedEvent
  | BehaviorRejectedEvent;

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
};

export type ContractDiff = {
  interfaceAdded: string[];
  interfaceRemoved: string[];
  dependsOnAdded: string[];
  dependsOnRemoved: string[];
};

export type BehaviorChangeKind = 'added' | 'revised' | 'status_changed' | 'revision_pending';

export type BehaviorChange = BehaviorContent & {
  id: BehaviorId;
  change: BehaviorChangeKind;
  fromVersion: number | null;
  version: number;
  fromStatus: BehaviorStatus | null;
  status: BehaviorStatus;
  descriptionChanged: boolean;
  contractDiff: ContractDiff;
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

export type PlannerDelta = DeltaWindow & {
  changes: PlannerBehaviorChange[];
  decisions: Decision[];
};

export type LedgerSummary = Record<BehaviorStatus, number> & {
  pendingRevisions: number;
};
