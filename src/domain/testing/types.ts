import type { BehaviorId, BehaviorTestCounts, RunStatus } from '@/domain/ledger/types';

export type TestCaseStatus = 'passed' | 'failed' | 'skipped';

export type TestCase = {
  name: string;
  suite: string;
  status: TestCaseStatus;
  message: string | null;
  details: string | null;
};

export type TesterTestCase = {
  name: string;
  status: TestCaseStatus;
  message: string | null;
};

export type TestPolicy = {
  include: string[];
  testCommand: string;
  allowFileSystem: boolean;
};

export type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type MappedResults = {
  counts: BehaviorTestCounts[];
  untagged: string[];
};

export type SourceFile = {
  path: string;
  content: string;
};

export type SourceIndex = {
  lines: string[];
};

export type FileHashes = Record<string, string>;

export type SyncSnapshot = {
  repo: FileHashes;
  workspace: FileHashes;
  base: FileHashes;
};

export type SyncPlan = {
  pull: string[];
  push: string[];
  deleteFromWorkspace: string[];
  deleteFromRepo: string[];
  conflicts: string[];
  notPushed: string[];
  base: FileHashes;
};

export type ForbiddenUse = {
  path: string;
  line: number;
  rule: string;
};

export type SyncReport = {
  pulled: string[];
  pushed: string[];
  deletedFromRepo: string[];
  deletedFromWorkspace: string[];
  conflicts: string[];
  notPushed: string[];
  refused: ForbiddenUse[];
};

export type RunTotals = {
  passed: number;
  failed: number;
  skipped: number;
};

export type RunOutcome = {
  runId: string;
  status: RunStatus;
  sync: SyncReport;
  cases: TestCase[];
  counts: BehaviorTestCounts[];
  untagged: string[];
  unsubmitted: BehaviorId[];
  exitCode: number | null;
  output: string;
};

export type TesterRunReport = {
  runId: string;
  status: RunStatus;
  totals: RunTotals;
  tests: TesterTestCase[];
  untagged: string[];
  unsubmitted: BehaviorId[];
  sync: SyncReport;
  note: string | null;
};

export type PlannerRunReport = {
  runId: string;
  status: RunStatus;
  totals: RunTotals;
  tests: TestCase[];
  untagged: string[];
  unsubmitted: BehaviorId[];
  sync: SyncReport;
  exitCode: number | null;
  outputTail: string;
};

export type ConflictSide = 'repo' | 'tester';

export type ConflictResolution = {
  copyFrom: ConflictSide | null;
  removeFrom: ConflictSide | null;
  baseHash: string | null;
};
