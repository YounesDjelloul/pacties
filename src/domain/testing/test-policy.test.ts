import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_GLOBS, detectTestPolicy, isMirroredPath, isSafeRelativePath, isTestPath } from '@/domain/testing/test-policy';

const policy = { include: DEFAULT_TEST_GLOBS, testCommand: 'npx vitest run', allowFileSystem: false };

describe('detectTestPolicy', () => {
  it('detects vitest from dev dependencies with a junit placeholder', () => {
    expect(detectTestPolicy({ devDependencies: { vitest: '^5.0.3' } })?.testCommand).toBe(
      'npx vitest run --reporter=default --reporter=junit --outputFile.junit={junit}',
    );
  });

  it('detects jest only when jest-junit is installed', () => {
    expect(detectTestPolicy({ dependencies: { jest: '^30.0.0' } })).toBeNull();
    expect(detectTestPolicy({ dependencies: { jest: '^30.0.0' }, devDependencies: { 'jest-junit': '^16.0.0' } })?.testCommand).toContain('--ci');
  });

  it('detects nothing without a manifest or a known runner', () => {
    expect(detectTestPolicy(null)).toBeNull();
    expect(detectTestPolicy({ devDependencies: { mocha: '^11.0.0' } })).toBeNull();
  });
});

describe('isTestPath', () => {
  it.each([
    'src/domain/ledger/fold-ledger.test.ts',
    'src/features/workflow/domain/__tests__/workflow-history.test.ts',
    'src/features/workflow/domain/__tests__/helpers.ts',
    'src/test-support/temp-workspace.ts',
    'src/components/__snapshots__/card.test.ts.snap',
    'e2e/workflow-details.spec.ts',
    'src/zahlung é/limit.spec.tsx',
  ])('accepts %s', (path) => {
    expect(isTestPath(path, policy)).toBe(true);
  });

  it.each([
    'src/domain/ledger/fold-ledger.ts',
    'src/test/setup.ts',
    'node_modules/zod/index.test.ts',
    'dist/cli/index.test.js',
    'CLAUDE.md',
    '../canvas/src/a.test.ts',
    '/abs/a.test.ts',
  ])('refuses %s', (path) => {
    expect(isTestPath(path, policy)).toBe(false);
  });
});

describe('isMirroredPath', () => {
  it.each(['CLAUDE.md', 'AGENTS.md', 'ARCHITECTURE.md', '.cursor/rules/testing.mdc', 'package.json', 'tsconfig.app.json', 'src/a.test.ts'])('mirrors %s', (path) => {
    expect(isMirroredPath(path, policy)).toBe(true);
  });

  it.each(['README.md', 'vite.config.ts', 'src/main.ts', 'docs/CLAUDE.md', '.claude/settings.json'])('does not mirror %s', (path) => {
    expect(isMirroredPath(path, policy)).toBe(false);
  });
});

describe('isSafeRelativePath', () => {
  it.each(['', '/etc/passwd', 'a/../b', '..', './a', 'a//b', 'a\\b', 'C:/x', 'a\0b', 'a/'])('refuses %j', (path) => {
    expect(isSafeRelativePath(path)).toBe(false);
  });

  it.each(['a', 'src/zahlung é/x.test.ts', '.cursor/rules/x.mdc', '..hidden/a'])('accepts %j', (path) => {
    expect(isSafeRelativePath(path)).toBe(true);
  });
});
