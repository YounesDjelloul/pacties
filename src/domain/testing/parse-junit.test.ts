import { describe, expect, it } from 'vitest';
import { parseJunit } from '@/domain/testing/parse-junit';
import { jestReport, pytestReport, vitestReport } from '@/test-support/junit-fixtures';

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

describe('parseJunit', () => {
  it('reads a vitest report with CRLF line endings, entities, skips and unicode names', () => {
    const cases = unwrap(parseJunit(vitestReport));
    expect(cases.map((testCase) => [testCase.name, testCase.status])).toEqual([
      ['checkDailyLimit > [B10] refuses 10000.01 over the limit', 'failed'],
      ['checkDailyLimit > [B10] [B2] allows exactly the limit', 'passed'],
      ['checkDailyLimit > [B9] counts refunds back', 'skipped'],
      ['formats Zoë Ørsted-Ñúñez without transliteration', 'passed'],
      ['useRefund > [B2] refuses a refund 31 days after purchase', 'passed'],
    ]);
    expect(cases[0]).toMatchObject({
      suite: 'src/features/transfer/domain/__tests__/daily-limit.test.ts',
      message: "expected { ok: true } to deeply equal { ok: false, error: 'LIMIT' }",
    });
    expect(cases[0]?.details).toContain('daily-limit.test.ts:14:23');
    expect(cases[1]).toMatchObject({ message: null, details: null });
  });

  it('takes the first line of the body as the message when a jest failure has no message attribute', () => {
    const cases = unwrap(parseJunit(jestReport));
    expect(cases[0]).toMatchObject({
      suite: '[B4] transfers > [B4] transfers rejects a negative amount',
      status: 'failed',
      message: 'Error: expect(received).toThrow(expected)',
    });
    expect(cases[0]?.details).toContain('Zahlungs Dienst é');
  });

  it('treats a pytest error element as a failure and reads a self-closing test case as passed', () => {
    const cases = unwrap(parseJunit(pytestReport));
    expect(cases).toEqual([
      {
        name: 'test_b7_refund_window[B7]',
        suite: 'pytest > tests.test_refund',
        status: 'failed',
        message: "ModuleNotFoundError: No module named 'refunds.policy'",
        details: 'E   ModuleNotFoundError',
      },
      { name: 'test_untagged', suite: 'pytest > tests.test_refund', status: 'passed', message: null, details: null },
    ]);
  });

  it('reads nested suites and a report without a testsuites root', () => {
    const xml = '<testsuite name="outer"><testsuite name="inner"><testcase name="[B3] a" classname="x"/></testsuite></testsuite>';
    expect(unwrap(parseJunit(xml))).toEqual([{ name: '[B3] a', suite: 'outer > inner > x', status: 'passed', message: null, details: null }]);
  });

  it('returns no cases for a run without tests', () => {
    expect(unwrap(parseJunit('<testsuites name="vitest tests" tests="0"></testsuites>'))).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['whitespace only', ' \r\n\t'],
  ])('fails on an %s report', (_, xml) => {
    expect(parseJunit(xml)).toEqual({ ok: false, error: 'The test run produced an empty JUnit report' });
  });

  it('fails on a report truncated mid-element without quoting its content', () => {
    const truncated = vitestReport.slice(0, vitestReport.indexOf('allows exactly'));
    const result = parseJunit(truncated);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('checkDailyLimit');
  });
});
