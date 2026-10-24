import { describe, expect, it } from 'vitest';
import { planConflictResolution, planSync } from '@/domain/testing/plan-sync';
import { DEFAULT_TEST_GLOBS } from '@/domain/testing/test-policy';
import type { SyncSnapshot } from '@/domain/testing/types';

const policy = { include: DEFAULT_TEST_GLOBS, testCommand: 'npx vitest run', allowFileSystem: false };
const TEST = 'src/features/zahlung é/domain/__tests__/daily limit.test.ts';
const OTHER_TEST = 'src/b10.test.ts';
const CONVENTIONS = 'AGENTS.md';

const plan = (snapshot: Partial<SyncSnapshot>) => planSync({ repo: {}, workspace: {}, base: {}, ...snapshot }, policy);

describe('planSync', () => {
  it('does nothing when repo and workspace agree, and records the shared hash as the new base', () => {
    expect(plan({ repo: { [TEST]: 'h1' }, workspace: { [TEST]: 'h1' } })).toEqual({
      pull: [],
      push: [],
      deleteFromWorkspace: [],
      deleteFromRepo: [],
      conflicts: [],
      notPushed: [],
      base: { [TEST]: 'h1' },
    });
  });

  it('pulls a file the repo changed while the workspace did not', () => {
    expect(plan({ repo: { [TEST]: 'h2' }, workspace: { [TEST]: 'h1' }, base: { [TEST]: 'h1' } })).toMatchObject({ pull: [TEST], base: { [TEST]: 'h2' } });
  });

  it('pulls a file that only exists in the repo', () => {
    expect(plan({ repo: { [TEST]: 'h1', [CONVENTIONS]: 'c1' } })).toMatchObject({ pull: [CONVENTIONS, TEST] });
  });

  it('pushes a test the workspace changed while the repo did not', () => {
    expect(plan({ repo: { [TEST]: 'h1' }, workspace: { [TEST]: 'h3' }, base: { [TEST]: 'h1' } })).toMatchObject({ push: [TEST], base: { [TEST]: 'h3' } });
  });

  it('pushes a new test written in the workspace', () => {
    expect(plan({ workspace: { [OTHER_TEST]: 'n1' } })).toMatchObject({ push: [OTHER_TEST], base: { [OTHER_TEST]: 'n1' } });
  });

  it('reports a conflict when both sides changed a test, keeping the old base', () => {
    expect(plan({ repo: { [TEST]: 'r2' }, workspace: { [TEST]: 'w2' }, base: { [TEST]: 'h1' } })).toMatchObject({
      conflicts: [TEST],
      push: [],
      pull: [],
      base: { [TEST]: 'h1' },
    });
  });

  it('reports a conflict when both sides created the same test differently', () => {
    expect(plan({ repo: { [TEST]: 'r1' }, workspace: { [TEST]: 'w1' } })).toMatchObject({ conflicts: [TEST], base: {} });
  });

  it('deletes from the repo a test the tester deleted, and from the workspace a test the repo deleted', () => {
    expect(plan({ repo: { [TEST]: 'h1' }, workspace: {}, base: { [TEST]: 'h1', [OTHER_TEST]: 'o1' }, ...{} })).toMatchObject({
      deleteFromRepo: [TEST],
      base: {},
    });
    expect(plan({ repo: {}, workspace: { [OTHER_TEST]: 'o1' }, base: { [OTHER_TEST]: 'o1' } })).toMatchObject({ deleteFromWorkspace: [OTHER_TEST], base: {} });
  });

  it('forgets a file both sides deleted', () => {
    expect(plan({ base: { [TEST]: 'h1' } })).toMatchObject({ deleteFromRepo: [], deleteFromWorkspace: [], base: {} });
  });

  it('never pushes edits to conventions or config, and reports them as not pushed', () => {
    expect(plan({ repo: { [CONVENTIONS]: 'c1', 'package.json': 'p1' }, workspace: { [CONVENTIONS]: 'c2', 'package.json': 'p1' }, base: { [CONVENTIONS]: 'c1', 'package.json': 'p1' } })).toMatchObject({
      push: [],
      notPushed: [CONVENTIONS],
      base: { [CONVENTIONS]: 'c1', 'package.json': 'p1' },
    });
  });

  it('never pushes an implementation file the tester created, nor one under node_modules or with an unsafe path', () => {
    const result = plan({
      workspace: { 'src/features/transfer/domain/daily-limit.ts': 'x', 'node_modules/pkg/a.test.ts': 'y', '../outside.test.ts': 'z', 'src/./a.test.ts': 'w' },
    });
    expect(result.push).toEqual([]);
    expect(result.notPushed.sort()).toEqual(['../outside.test.ts', 'node_modules/pkg/a.test.ts', 'src/./a.test.ts', 'src/features/transfer/domain/daily-limit.ts']);
  });
});

describe('planConflictResolution', () => {
  const conflicted = { repo: { [TEST]: 'r2' }, workspace: { [TEST]: 'w2' }, base: { [TEST]: 'h1' } };

  it('keeps the repo version by copying it into the workspace', () => {
    expect(planConflictResolution(TEST, 'repo', conflicted, policy)).toEqual({ ok: true, value: { copyFrom: 'repo', removeFrom: null, baseHash: 'r2' } });
  });

  it('keeps the tester version by copying it into the repo', () => {
    expect(planConflictResolution(TEST, 'tester', conflicted, policy)).toEqual({ ok: true, value: { copyFrom: 'tester', removeFrom: null, baseHash: 'w2' } });
  });

  it('keeps a deletion by removing the file on the other side', () => {
    const deletedByTester = { repo: { [TEST]: 'r2' }, workspace: {}, base: { [TEST]: 'h1' } };
    expect(planConflictResolution(TEST, 'tester', deletedByTester, policy)).toEqual({ ok: true, value: { copyFrom: null, removeFrom: 'repo', baseHash: null } });
    expect(planConflictResolution(TEST, 'repo', deletedByTester, policy)).toEqual({ ok: true, value: { copyFrom: 'repo', removeFrom: null, baseHash: 'r2' } });
  });

  it('refuses a path that is not in conflict', () => {
    const result = planConflictResolution(OTHER_TEST, 'repo', { ...conflicted, repo: { ...conflicted.repo, [OTHER_TEST]: 'o1' }, workspace: { ...conflicted.workspace, [OTHER_TEST]: 'o1' } }, policy);
    expect(result).toEqual({ ok: false, error: 'src/b10.test.ts is not in conflict; run "pacties conflicts" to list the files that are' });
  });
});
