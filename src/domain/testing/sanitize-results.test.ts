import { describe, expect, it } from 'vitest';
import { MAX_TESTER_MESSAGE_LENGTH, REDACTION, buildSourceIndex, sanitizeForTester } from '@/domain/testing/sanitize-results';
import type { TestCase } from '@/domain/testing/types';

const implementation = [
  {
    path: 'src/features/transfer/domain/daily-limit.ts',
    content: [
      'export function checkDailyLimit(totals: DailyTotals, amount: Money) {',
      '\tconst remaining = totals.limit.minus(totals.spent);\r',
      '  if (amount.greaterThan(remaining)) {',
      '    return fail("LIMIT");',
      '  }',
      '  return ok(undefined);',
      '}',
    ].join('\n'),
  },
];

const failing = (message: string | null): TestCase => ({
  name: 'checkDailyLimit > [B10] refuses 10000.01',
  suite: 'src/features/transfer/domain/__tests__/daily-limit.test.ts',
  status: 'failed',
  message,
  details: 'AssertionError\n at checkDailyLimit (src/features/transfer/domain/daily-limit.ts:4:12)',
});

const sanitizeOne = (message: string | null, hiddenPaths: string[] = []) =>
  sanitizeForTester([failing(message)], buildSourceIndex(implementation), hiddenPaths)[0];

describe('sanitizeForTester', () => {
  it('keeps the name, status and first assertion line but never the details', () => {
    expect(sanitizeOne("expected { ok: true } to deeply equal { ok: false, error: 'LIMIT' }")).toEqual({
      name: 'checkDailyLimit > [B10] refuses 10000.01',
      status: 'failed',
      message: "expected { ok: true } to deeply equal { ok: false, error: 'LIMIT' }",
    });
  });

  it('redacts a message that quotes an implementation line, whatever its indentation or line ending', () => {
    expect(sanitizeOne("expected '    const   remaining = totals.limit.minus(totals.spent);' to be ''")?.message).toBe(REDACTION);
    expect(sanitizeOne('SyntaxError near: export function checkDailyLimit(totals: DailyTotals, amount: Money) {')?.message).toBe(REDACTION);
  });

  it('does not redact short common lines such as a closing brace or a bare return', () => {
    expect(sanitizeOne('expected } to be return')?.message).toBe('expected } to be return');
  });

  it('skips stack frames and code frames to find the first meaningful line, and strips ANSI colours', () => {
    const message = [' ❯ src/features/transfer/domain/daily-limit.ts:4:12', '   4|     return fail("LIMIT");', '\u001b[31mAssertionError: expected 1 to be 2\u001b[39m'].join('\r\n');
    expect(sanitizeOne(message)?.message).toBe('AssertionError: expected 1 to be 2');
  });

  it('returns an empty message when only stack frames remain', () => {
    expect(sanitizeOne('    at checkDailyLimit (src/x.ts:1:1)\n    at run (node:internal)')?.message).toBe('');
  });

  it('replaces hidden absolute paths with <repo>, including paths with spaces and accents', () => {
    const message = "Cannot find module '@/features/x' imported from /Users/dev/Zahlungs Dienst é/src/x.test.ts";
    expect(sanitizeOne(message, ['/Users/dev/Zahlungs Dienst é'])?.message).toBe("Cannot find module '@/features/x' imported from <repo>/src/x.test.ts");
  });

  it('truncates long messages to the limit', () => {
    const sanitized = sanitizeOne(`expected ${'9'.repeat(1_000)} to be 0`)?.message ?? '';
    expect(sanitized).toHaveLength(MAX_TESTER_MESSAGE_LENGTH);
    expect(sanitized.endsWith('…')).toBe(true);
  });

  it('keeps passing tests with a null message', () => {
    const passing: TestCase = { ...failing(null), status: 'passed', details: null };
    expect(sanitizeForTester([passing], buildSourceIndex([]), [])).toEqual([{ name: passing.name, status: 'passed', message: null }]);
  });
});

describe('buildSourceIndex', () => {
  it('indexes only normalized lines of at least sixteen characters', () => {
    expect(buildSourceIndex([{ path: 'a.ts', content: '}\r\n  return ok(undefined);\n\t\tif (x) {\n' }])).toEqual({ lines: ['return ok(undefined);'] });
  });
});
