import { compareBehaviorIds, parseBehaviorId } from '@/domain/ledger/behavior-ids';
import type { BehaviorId, BehaviorTestCounts } from '@/domain/ledger/types';
import type { MappedResults, TestCase } from '@/domain/testing/types';

const TAG_PATTERN = /\[(B\d+)\]/gu;

export function extractTags(text: string): BehaviorId[] {
  const ids = [...text.matchAll(TAG_PATTERN)].flatMap((match) => {
    const parsed = parseBehaviorId(match[1] ?? '');
    return parsed.ok ? [parsed.value] : [];
  });
  return [...new Set(ids)].sort(compareBehaviorIds);
}

export function mapResultsToBehaviors(cases: TestCase[]): MappedResults {
  const counts = new Map<BehaviorId, BehaviorTestCounts>();
  const untagged: string[] = [];

  for (const testCase of cases) {
    const ids = extractTags(`${testCase.suite} ${testCase.name}`);
    if (ids.length === 0) {
      untagged.push(testCase.name);
      continue;
    }
    if (testCase.status === 'skipped') {
      continue;
    }
    for (const id of ids) {
      const current = counts.get(id) ?? { id, passed: 0, failed: 0 };
      counts.set(id, testCase.status === 'passed' ? { ...current, passed: current.passed + 1 } : { ...current, failed: current.failed + 1 });
    }
  }

  const sorted = [...counts.values()].sort((left, right) => compareBehaviorIds(left.id, right.id));
  return { counts: sorted, untagged };
}
