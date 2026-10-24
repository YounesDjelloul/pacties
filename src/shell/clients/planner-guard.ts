import { readGitExclude, readGuardRecord, readLocalSettings, writeGitExclude, writeGuardRecord, writeLocalSettings } from '@/data/claude-local-settings';
import { withRunLock } from '@/data/storage-lock';
import { readTestPolicy } from '@/data/testing-files';
import { LOCAL_SETTINGS_RELATIVE_PATH, addExcludeLine, addPlannerGuard, buildPlannerGuardRules, removePlannerGuard } from '@/domain/clients/planner-guard';
import { DEFAULT_TEST_GLOBS } from '@/domain/testing/test-policy';
import { ValidationError } from '@/lib/errors';
import type { Project } from '@/domain/project/types';

export async function guardPlannerAgainstTests(project: Project): Promise<string[]> {
  const policy = await readTestPolicy(project.dir);
  const rules = buildPlannerGuardRules(policy?.include ?? DEFAULT_TEST_GLOBS);

  return withRunLock(project.dir, async (lock) => {
    const previous = await readGuardRecord(project.dir);
    const withoutPrevious = removePlannerGuard(await readLocalSettings(project.repoRoot), previous);
    const merged = withoutPrevious.ok ? addPlannerGuard(withoutPrevious.value, rules) : withoutPrevious;
    if (!merged.ok) {
      throw new ValidationError(`${LOCAL_SETTINGS_RELATIVE_PATH} was left untouched: ${merged.error}`);
    }

    await writeLocalSettings(project.repoRoot, merged.value);
    await writeGuardRecord(project.dir, rules, lock);

    const exclude = await readGitExclude(project.repoRoot);
    const updated = exclude === null ? null : addExcludeLine(exclude.content, LOCAL_SETTINGS_RELATIVE_PATH);
    if (exclude !== null && updated !== null) {
      await writeGitExclude(exclude.filePath, updated);
    }
    return rules;
  });
}

export async function releasePlannerFromTestGuard(project: Project): Promise<number> {
  return withRunLock(project.dir, async (lock) => {
    const previous = await readGuardRecord(project.dir);
    const settings = await readLocalSettings(project.repoRoot);
    if (previous.length === 0 || settings === null) {
      await writeGuardRecord(project.dir, [], lock);
      return 0;
    }
    const released = removePlannerGuard(settings, previous);
    if (!released.ok) {
      throw new ValidationError(`${LOCAL_SETTINGS_RELATIVE_PATH} was left untouched: ${released.error}`);
    }
    await writeLocalSettings(project.repoRoot, released.value);
    await writeGuardRecord(project.dir, [], lock);
    return previous.length;
  });
}
