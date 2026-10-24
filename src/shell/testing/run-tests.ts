import { randomUUID } from 'node:crypto';
import { appendEvents } from '@/data/event-log';
import { listRepoFiles } from '@/data/git';
import { withLedgerLock, withRunLock } from '@/data/storage-lock';
import { runShellCommand } from '@/data/test-runner';
import { junitReportPath, readJunitReport, writeRunRecord } from '@/data/testing-files';
import { readTextFiles } from '@/data/workspace-files';
import { buildRunFinishedEvent, buildTestResultEvents } from '@/domain/ledger/build-events';
import { mapResultsToBehaviors } from '@/domain/testing/map-results';
import { parseJunit } from '@/domain/testing/parse-junit';
import { buildPlannerRunReport, buildTesterRunReport } from '@/domain/testing/run-report';
import { buildSourceIndex } from '@/domain/testing/sanitize-results';
import { JUNIT_PLACEHOLDER, isMirroredPath } from '@/domain/testing/test-policy';
import { config } from '@/lib/config';
import { loadLedger, stampAfter } from '@/shell/ledger/load-ledger';
import { loadTestPolicy } from '@/shell/testing/test-policy';
import { syncUnderLock } from '@/shell/testing/sync-workspace';
import type { BehaviorId, Role } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';
import type { PlannerRunReport, RunOutcome, SyncReport, TestCase, TestPolicy, TesterRunReport } from '@/domain/testing/types';

export async function runTestsForPlanner(project: Project, now: Date): Promise<PlannerRunReport> {
  return buildPlannerRunReport(await runTests(project, 'planner', now));
}

export async function runTestsForTester(project: Project, now: Date): Promise<TesterRunReport> {
  const outcome = await runTests(project, 'tester', now);
  const policy = await loadTestPolicy(project);
  const implementationPaths = (await listRepoFiles(project.repoRoot)).filter((path) => !isMirroredPath(path, policy));
  const index = buildSourceIndex(await readTextFiles(project.repoRoot, implementationPaths));
  return buildTesterRunReport(outcome, index, [project.repoRoot, project.dir, config.pactiesHome]);
}

async function runTests(project: Project, role: Role, now: Date): Promise<RunOutcome> {
  const policy = await loadTestPolicy(project);
  const runId = `${now.toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`;

  return withRunLock(project.dir, async (lock) => {
    const sync = await syncUnderLock(project, policy, lock);
    const stopped = stoppedBySync(sync, role);
    const outcome = stopped === null ? await execute(project, policy, runId, sync, now) : emptyOutcome(runId, stopped, sync);
    const recorded = { ...outcome, unsubmitted: await recordRun(project, role, outcome, now) };
    await writeRunRecord(project.dir, runId, { role, at: now.toISOString(), ...recorded }, lock);
    return recorded;
  });
}

function stoppedBySync(sync: SyncReport, role: Role): 'blocked' | 'refused' | null {
  if (sync.conflicts.length > 0) {
    return 'blocked';
  }
  return role === 'tester' && sync.refused.length > 0 ? 'refused' : null;
}

async function execute(project: Project, policy: TestPolicy, runId: string, sync: SyncReport, now: Date): Promise<RunOutcome> {
  const reportPath = junitReportPath(project.dir, runId);
  const command = policy.testCommand.split(JUNIT_PLACEHOLDER).join(shellQuote(reportPath));
  const result = await runShellCommand(command, project.repoRoot, reportPath);
  const parsed = parseJunit((await readJunitReport(project.dir, runId)) ?? '');
  if (!parsed.ok) {
    return { ...emptyOutcome(runId, 'crashed', sync), exitCode: result.exitCode, output: result.output };
  }

  const mapped = mapResultsToBehaviors(parsed.value);
  return {
    runId,
    status: 'completed',
    sync,
    cases: parsed.value,
    counts: mapped.counts,
    untagged: mapped.untagged,
    unsubmitted: [],
    exitCode: result.exitCode,
    output: result.output,
  };
}

async function recordRun(project: Project, role: Role, outcome: RunOutcome, now: Date): Promise<BehaviorId[]> {
  return withLedgerLock(project.dir, async (lock) => {
    const { ledger } = await loadLedger(project);
    const recorded = buildTestResultEvents(ledger, { runId: outcome.runId, counts: outcome.counts }, stampAfter(ledger, now));
    const lastSeq = recorded.events.at(-1)?.seq ?? ledger.headSeq;
    const paths = outcome.status === 'blocked' ? outcome.sync.conflicts : [...new Set(outcome.sync.refused.map((use) => use.path))];
    const finished = buildRunFinishedEvent({ runId: outcome.runId, role, status: outcome.status, paths }, { lastSeq, at: now.toISOString() });
    await appendEvents(project.dir, [...recorded.events, finished], lock);
    return recorded.unsubmitted;
  });
}

function emptyOutcome(runId: string, status: RunOutcome['status'], sync: SyncReport): RunOutcome {
  const cases: TestCase[] = [];
  return { runId, status, sync, cases, counts: [], untagged: [], unsubmitted: [], exitCode: null, output: '' };
}

function shellQuote(value: string): string {
  return `'${value.split("'").join(String.raw`'\''`)}'`;
}
