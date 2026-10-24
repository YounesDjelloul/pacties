import type { ApprovalRequest, BehaviorId, Ledger, Review } from '@/domain/ledger/types';

export type Screen = 'planner' | 'pacties';

export type PlannerActivity = 'idle' | 'busy';

export type InputSegment = { kind: 'toggle_screen' } | { kind: 'bytes'; text: string };

export type PanelKey = 'up' | 'down' | 'tick' | 'approve' | 'reject' | 'quit' | 'enter' | 'escape' | 'backspace' | { char: string };

export type JobLogKind = 'text' | 'tool' | 'result' | 'error';

export type JobLogEntry = {
  kind: JobLogKind;
  text: string;
};

export type StreamEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'log'; entry: JobLogEntry }
  | { kind: 'result'; sessionId: string | null; entry: JobLogEntry };

export type SessionPairs = Record<string, string>;

export type RunningJob = {
  requests: ApprovalRequest[];
  plannerSessionId: string;
};

export type JobState = {
  running: RunningJob | null;
  dispatched: string[];
  pairs: SessionPairs;
  log: JobLogEntry[];
};

export type PlannerState = {
  sessionId: string | null;
  idle: boolean;
  typedSinceIdle: boolean;
  newsSeq: number;
  nudgedSeq: number;
};

export type PlannerLaunch =
  | { kind: 'new'; sessionId: string }
  | { kind: 'resume'; sessionId: string }
  | { kind: 'pick' }
  | { kind: 'continue' };

export type PlannerReport = {
  activity: PlannerActivity;
  sessionId: string | null;
};

export type Rejecting = {
  id: BehaviorId;
  reason: string;
};

export type WrapperState = {
  screen: Screen;
  ledger: Ledger | null;
  reviews: Review[];
  cursor: number;
  unticked: BehaviorId[];
  rejecting: Rejecting | null;
  confirmQuit: boolean;
  message: string | null;
  job: JobState;
  planner: PlannerState;
};

export type WrapperEvent =
  | { kind: 'ledger_loaded'; ledger: Ledger; reviews: Review[]; newsSeq: number }
  | { kind: 'input'; segment: InputSegment }
  | { kind: 'planner_idle' }
  | { kind: 'planner_busy' }
  | { kind: 'planner_session'; sessionId: string }
  | { kind: 'job_event'; event: StreamEvent }
  | { kind: 'job_finished'; failure: string | null }
  | { kind: 'action_failed'; message: string };

export type WrapperEffect =
  | { kind: 'write_planner'; text: string }
  | { kind: 'nudge_planner'; text: string }
  | { kind: 'start_job'; requests: ApprovalRequest[]; sessionId: string | null }
  | { kind: 'save_pairs'; pairs: SessionPairs }
  | { kind: 'approve'; requests: ApprovalRequest[] }
  | { kind: 'reject'; id: BehaviorId; reason: string }
  | { kind: 'render' }
  | { kind: 'quit' };

export type Transition = {
  state: WrapperState;
  effects: WrapperEffect[];
};
