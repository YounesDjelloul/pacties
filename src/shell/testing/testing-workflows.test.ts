import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { approveBehaviors } from '@/shell/ledger/approve-behaviors';
import { getPlannerDelta } from '@/shell/ledger/get-delta';
import { proposeBehavior } from '@/shell/ledger/propose-behavior';
import { getBehavior } from '@/shell/ledger/read-behaviors';
import { reportContractIssue } from '@/shell/testing/report-contract-issue';
import { runTestsForPlanner, runTestsForTester } from '@/shell/testing/run-tests';
import { submitTests } from '@/shell/testing/submit-tests';
import { syncWorkspace, testerWorkspaceDir } from '@/shell/testing/sync-workspace';
import { loadTestPolicy } from '@/shell/testing/test-policy';
import { ConflictError, ValidationError } from '@/lib/errors';
import { refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import { createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';
import type { Project } from '@/domain/project/types';

const T1 = new Date('2026-10-25T00:59:59.999Z');
const T2 = new Date('2026-10-25T01:00:00.001Z');
const FAKE_RUNNER = fileURLToPath(new URL('../../test-support/fake-test-runner.mjs', import.meta.url));

const IMPLEMENTATION = [
  'export function checkDailyLimit(totals: DailyTotals, amount: Money) {',
  '  const remaining = totals.limit.minus(totals.spent);',
  '  return amount.greaterThan(remaining) ? fail("LIMIT") : ok(undefined);',
  '}',
].join('\r\n');

const LIMIT_TEST = 'src/features/transfer/__tests__/daily limit é.test.ts';

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), content);
}

async function exists(root: string, relativePath: string): Promise<boolean> {
  return fs.access(path.join(root, relativePath)).then(
    () => true,
    () => false,
  );
}

async function usePolicy(project: Project, overrides: { testCommand?: string; allowFileSystem?: boolean } = {}): Promise<void> {
  await writeFile(
    project.dir,
    'tester.json',
    JSON.stringify({ include: ['**/*.test.*', '**/__tests__/**'], testCommand: `node '${FAKE_RUNNER}' {junit}`, allowFileSystem: false, ...overrides }),
  );
}

async function repoWithTenBehaviors(project: Project): Promise<void> {
  await writeFile(project.repoRoot, 'src/features/transfer/daily-limit.ts', IMPLEMENTATION);
  await writeFile(project.repoRoot, 'AGENTS.md', '# Testing\r\nTest domain/ exhaustively.\n');
  await writeFile(project.repoRoot, 'package.json', '{ "name": "zahlung", "devDependencies": { "vitest": "^5.0.3" } }');
  await writeFile(project.repoRoot, 'src/features/refund/__tests__/refund.test.ts', "it('[B2] refuses a refund after 31 days', () => {})\n");
  for (let index = 0; index < 9; index += 1) {
    await proposeBehavior(project, { ...refundOutsideWindow, description: `refund case ${index + 1} is refused` }, T1);
  }
  await proposeBehavior(project, transferOverDailyLimit, T1);
  await approveBehaviors(project, [{ id: 'B10', version: 1 }, { id: 'B2', version: 1 }], T1);
}

describe('testing workflows', () => {
  const workspace = useTempWorkspace();

  describe('syncWorkspace', () => {
    it('mirrors tests, conventions and config into the tester workspace but never implementation files', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);

      const report = await syncWorkspace(project);
      const ws = testerWorkspaceDir(project);
      expect(report.pulled.sort()).toEqual(['AGENTS.md', 'package.json', 'src/features/refund/__tests__/refund.test.ts']);
      expect(await exists(ws, 'src/features/transfer/daily-limit.ts')).toBe(false);
      expect(await fs.readFile(path.join(ws, 'AGENTS.md'), 'utf8')).toBe('# Testing\r\nTest domain/ exhaustively.\n');

      const again = await syncWorkspace(project);
      expect([again.pulled, again.pushed, again.conflicts]).toEqual([[], [], []]);
    });

    it('never follows a symbolic link the tester planted in its workspace', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);
      await syncWorkspace(project);
      const ws = testerWorkspaceDir(project);
      await fs.symlink(path.join(project.repoRoot, 'src/features/transfer/daily-limit.ts'), path.join(ws, 'src/leak.test.ts'));

      const report = await syncWorkspace(project);
      expect(report.pushed).toEqual([]);
      expect(await exists(project.repoRoot, 'src/leak.test.ts')).toBe(false);
    });
  });

  describe('running tests', () => {
    it('pushes the tester tests, records results per behavior, and redacts implementation source for the tester only', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);
      await syncWorkspace(project);
      await writeFile(
        testerWorkspaceDir(project),
        LIMIT_TEST,
        [
          "it('[B10] refuses 10000.01 over the limit', () => {}) // fails with \"expected '  const remaining = totals.limit.minus(totals.spent);' to be ''\"",
          "it('[B10] allows exactly the limit', () => {})",
          "it('formats Zoë Ørsted-Ñúñez', () => {})",
        ].join('\r\n'),
      );
      await submitTests(project, [{ id: 'B10', version: 1 }, { id: 'B2', version: 1 }], T2);

      const tester = await runTestsForTester(project, T2);
      expect(tester.status).toBe('completed');
      expect(tester.sync.pushed).toEqual([LIMIT_TEST]);
      expect(tester.totals).toEqual({ passed: 3, failed: 1, skipped: 0 });
      expect(tester.tests.find((test) => test.name.startsWith('[B10] refuses'))?.message).toBe('[redacted: matches implementation source]');
      expect(tester.untagged).toEqual(['formats Zoë Ørsted-Ñúñez']);
      expect(JSON.stringify(tester)).not.toContain(project.repoRoot);
      expect(await exists(project.repoRoot, LIMIT_TEST)).toBe(true);

      expect((await getBehavior(project, 'B10')).status).toBe('tested');
      expect((await getBehavior(project, 'B2')).status).toBe('passing');

      const planner = await runTestsForPlanner(project, T2);
      expect(planner.tests.find((test) => test.name.startsWith('[B10] refuses'))?.details).toContain('totals.limit.minus');
      expect(planner.outputTail).toContain('ran 2 files');
      const delta = await getPlannerDelta(project, { peek: true });
      expect(delta.testResults.filter((result) => result.id === 'B10').map((result) => [result.passed, result.failed])).toEqual([
        [1, 1],
        [1, 1],
      ]);
    });

    it('blocks the run when a test changed both in the repository and in the workspace', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);
      await syncWorkspace(project);
      await writeFile(project.repoRoot, 'src/features/refund/__tests__/refund.test.ts', "it('[B2] edited by the implementer', () => {})\n");
      await writeFile(testerWorkspaceDir(project), 'src/features/refund/__tests__/refund.test.ts', "it('[B2] edited by the tester', () => {})\n");

      const report = await runTestsForTester(project, T2);
      expect(report.status).toBe('blocked');
      expect(report.sync.conflicts).toEqual(['src/features/refund/__tests__/refund.test.ts']);
      expect(report.tests).toEqual([]);
      expect(await fs.readFile(path.join(project.repoRoot, 'src/features/refund/__tests__/refund.test.ts'), 'utf8')).toContain('implementer');
    });

    it('refuses a tester run whose tests read files, and never pushes them, while the planner can still run', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);
      await syncWorkspace(project);
      await writeFile(
        testerWorkspaceDir(project),
        'src/sneaky.test.ts',
        "import { readFileSync } from 'node:fs';\nit('[B10] leaks', () => {}) // fails with \"x\"\n",
      );

      const tester = await runTestsForTester(project, T2);
      expect(tester.status).toBe('refused');
      expect(tester.sync.refused).toEqual([{ path: 'src/sneaky.test.ts', line: 1, rule: 'imports a file-system or process module' }]);
      expect(await exists(project.repoRoot, 'src/sneaky.test.ts')).toBe(false);

      const planner = await runTestsForPlanner(project, T2);
      expect(planner.status).toBe('completed');
      expect(planner.tests.map((test) => test.name)).toEqual(['[B2] refuses a refund after 31 days']);
    });

    it('pushes file-system tests when the policy allows the file system', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project, { allowFileSystem: true });
      await syncWorkspace(project);
      await writeFile(testerWorkspaceDir(project), 'src/temp-home.test.ts', "import fs from 'node:fs/promises';\nit('[B10] writes the ledger', () => {})\n");

      const report = await runTestsForTester(project, T2);
      expect([report.status, report.sync.pushed]).toEqual(['completed', ['src/temp-home.test.ts']]);
    });

    it('reports a crashed run when the test command produces no report', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project, { testCommand: `node '${FAKE_RUNNER}' {junit} crash` });

      const tester = await runTestsForTester(project, T2);
      expect(tester.status).toBe('crashed');
      expect(tester.note).toContain('exit code 2');
      expect(JSON.stringify(tester)).not.toContain('SyntaxError');

      const planner = await runTestsForPlanner(project, T2);
      expect(planner.outputTail).toContain('SyntaxError: Unexpected token');
    });

    it('serializes concurrent runs so both complete with distinct run ids', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);
      await submitTests(project, [{ id: 'B2', version: 1 }], T1).catch(() => undefined);

      const [first, second] = await Promise.all([runTestsForPlanner(project, T2), runTestsForTester(project, T2)]);
      expect([first.status, second.status]).toEqual(['completed', 'completed']);
      expect(first.runId).not.toBe(second.runId);
    });
  });

  describe('submitting tests and reporting contract issues', () => {
    it('refuses a submission when no workspace test carries the tag', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await usePolicy(project);
      await syncWorkspace(project);
      await expect(submitTests(project, [{ id: 'B10', version: 1 }], T2)).rejects.toThrow(
        new ValidationError("No test is tagged [B10]; put the tag in each test name, e.g. it('[B10] ...')"),
      );
    });

    it('surfaces a stale version as a conflict', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      await expect(reportContractIssue(project, { id: 'B10', version: 2, problem: 'remaining is undefined' }, T2)).rejects.toBeInstanceOf(ConflictError);
    });

    it('records a contract issue the planner sees in its delta', async () => {
      const project = await createTempProject(workspace());
      await repoWithTenBehaviors(project);
      const view = await reportContractIssue(project, { id: 'B10', version: 1, problem: 'remaining is undefined\r\nonce the limit is hit' }, T2);
      expect(view.openIssues.map((issue) => issue.problem)).toEqual(['remaining is undefined once the limit is hit']);
      expect((await getPlannerDelta(project, { peek: true })).contractIssues.map((issue) => issue.id)).toEqual(['B10']);
    });
  });

  describe('loadTestPolicy', () => {
    it('detects vitest from package.json and stores the policy', async () => {
      const project = await createTempProject(workspace());
      await writeFile(project.repoRoot, 'package.json', '{ "devDependencies": { "vitest": "^5.0.3" } }');
      const policy = await loadTestPolicy(project);
      expect(policy.testCommand).toContain('--outputFile.junit={junit}');
      expect(JSON.parse(await fs.readFile(path.join(project.dir, 'tester.json'), 'utf8'))).toEqual(policy);
    });

    it('asks for a policy file when no runner can be detected', async () => {
      const project = await createTempProject(workspace());
      await expect(loadTestPolicy(project)).rejects.toThrow(/could not detect how to run the tests/u);
    });
  });
});
