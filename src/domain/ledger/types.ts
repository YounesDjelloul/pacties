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
