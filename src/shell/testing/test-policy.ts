import { readPackageManifest, readTestPolicy, writeTestPolicy } from '@/data/testing-files';
import { testerPolicyPath } from '@/data/storage-paths';
import { withRunLock } from '@/data/storage-lock';
import { detectTestPolicy } from '@/domain/testing/test-policy';
import { ValidationError } from '@/lib/errors';
import type { Project } from '@/domain/project/types';
import type { TestPolicy } from '@/domain/testing/types';

export async function loadTestPolicy(project: Project): Promise<TestPolicy> {
  const stored = await readTestPolicy(project.dir);
  if (stored !== null) {
    return stored;
  }

  const detected = detectTestPolicy(await readPackageManifest(project.repoRoot));
  if (detected === null) {
    throw new ValidationError(
      `pacties could not detect how to run the tests of ${project.name}. Create ${testerPolicyPath(project.dir)} with {"include": [...test globs], "testCommand": "... writing JUnit XML to {junit}", "allowFileSystem": false}`,
    );
  }

  await withRunLock(project.dir, (lock) => writeTestPolicy(project.dir, detected, lock));
  return detected;
}
