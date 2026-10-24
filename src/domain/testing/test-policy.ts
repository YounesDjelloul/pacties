import picomatch from 'picomatch';
import type { PackageManifest, TestPolicy } from '@/domain/testing/types';

export const JUNIT_PLACEHOLDER = '{junit}';

export const DEFAULT_TEST_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/__snapshots__/**',
  '**/test-support/**',
  'e2e/**',
];

export const CONVENTION_GLOBS = ['CLAUDE.md', 'AGENTS.md', 'ARCHITECTURE.md', '.cursor/rules/**'];

export const CONFIG_GLOBS = ['package.json', 'tsconfig*.json'];

const NEVER_SYNCED_GLOBS = ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.git/**'];

const VITEST_COMMAND = `npx vitest run --reporter=default --reporter=junit --outputFile.junit=${JUNIT_PLACEHOLDER}`;
const JEST_COMMAND = `JEST_JUNIT_OUTPUT_FILE=${JUNIT_PLACEHOLDER} npx jest --ci --reporters=default --reporters=jest-junit`;

export function detectTestPolicy(manifest: PackageManifest | null): TestPolicy | null {
  const packages = { ...manifest?.dependencies, ...manifest?.devDependencies };
  if ('vitest' in packages) {
    return { include: DEFAULT_TEST_GLOBS, testCommand: VITEST_COMMAND, allowFileSystem: false };
  }
  if ('jest' in packages && 'jest-junit' in packages) {
    return { include: DEFAULT_TEST_GLOBS, testCommand: JEST_COMMAND, allowFileSystem: false };
  }
  return null;
}

export function isTestPath(path: string, policy: TestPolicy): boolean {
  return isSafeRelativePath(path) && !matches(path, NEVER_SYNCED_GLOBS) && matches(path, policy.include);
}

export function isMirroredPath(path: string, policy: TestPolicy): boolean {
  return isTestPath(path, policy) || (isSafeRelativePath(path) && matches(path, [...CONVENTION_GLOBS, ...CONFIG_GLOBS]));
}

export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\') || path.includes('\0') || /^[A-Za-z]:/u.test(path)) {
    return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function matches(path: string, globs: string[]): boolean {
  return picomatch(globs, { dot: true })(path);
}
