import { describe, expect, it } from 'vitest';
import { extractTags, mapResultsToBehaviors } from '@/domain/testing/map-results';
import type { TestCase } from '@/domain/testing/types';

const testCase = (name: string, status: TestCase['status'], suite = 'src/transfer/__tests__/limit.test.ts'): TestCase => ({
  name,
  suite,
  status,
  message: null,
  details: null,
});

describe('extractTags', () => {
  it('finds every tag, normalizes leading zeros, dedupes and sorts numerically', () => {
    expect(extractTags('[B10] and [B9] then [B010] and [B2]')).toEqual(['B2', 'B9', 'B10']);
  });

  it.each(['', 'B4 without brackets', '[b4] lowercase', '[B] no number', '[B0] zero', '[ B4 ] spaced', '(B4) parens'])('finds nothing in "%s"', (text) => {
    expect(extractTags(text)).toEqual([]);
  });
});

describe('mapResultsToBehaviors', () => {
  it('counts passes and failures per tag, including tests carrying several tags and tags in the suite path', () => {
    const mapped = mapResultsToBehaviors([
      testCase('[B10] refuses 10000.01', 'failed'),
      testCase('[B10] [B2] allows exactly the limit', 'passed'),
      testCase('allows 0.01', 'passed', '[B9] limit > small amounts'),
      testCase('[B9] counts refunds back', 'skipped'),
      testCase('[B2] refuses after 31 days', 'passed'),
    ]);
    expect(mapped.counts).toEqual([
      { id: 'B2', passed: 2, failed: 0 },
      { id: 'B9', passed: 1, failed: 0 },
      { id: 'B10', passed: 1, failed: 1 },
    ]);
    expect(mapped.untagged).toEqual([]);
  });

  it('lists untagged tests by name and leaves them out of the counts', () => {
    const mapped = mapResultsToBehaviors([testCase('formats Zoë Ørsted-Ñúñez', 'passed'), testCase('[B3] works', 'failed')]);
    expect(mapped).toEqual({ counts: [{ id: 'B3', passed: 0, failed: 1 }], untagged: ['formats Zoë Ørsted-Ñúñez'] });
  });

  it('gives a tag whose only test was skipped no count at all', () => {
    expect(mapResultsToBehaviors([testCase('[B9] later', 'skipped')]).counts).toEqual([]);
  });

  it('returns nothing for no tests', () => {
    expect(mapResultsToBehaviors([])).toEqual({ counts: [], untagged: [] });
  });
});
