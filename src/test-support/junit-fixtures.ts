export const vitestReport = [
  '<?xml version="1.0" encoding="UTF-8" ?>',
  '<testsuites name="vitest tests" tests="5" failures="1" errors="0" time="0.41">',
  '    <testsuite name="src/features/transfer/domain/__tests__/daily-limit.test.ts" tests="4" failures="1" errors="0" skipped="1" time="0.2">',
  '        <testcase classname="src/features/transfer/domain/__tests__/daily-limit.test.ts" name="checkDailyLimit &gt; [B10] refuses 10000.01 over the limit" time="0.01">',
  '            <failure message="expected { ok: true } to deeply equal { ok: false, error: &apos;LIMIT&apos; }" type="AssertionError">',
  'AssertionError: expected { ok: true } to deeply equal { ok: false, error: &apos;LIMIT&apos; }',
  ' ❯ src/features/transfer/domain/__tests__/daily-limit.test.ts:14:23',
  '            </failure>',
  '        </testcase>',
  '        <testcase classname="src/features/transfer/domain/__tests__/daily-limit.test.ts" name="checkDailyLimit &gt; [B10] [B2] allows exactly the limit" time="0.002">',
  '        </testcase>',
  '        <testcase classname="src/features/transfer/domain/__tests__/daily-limit.test.ts" name="checkDailyLimit &gt; [B9] counts refunds back" time="0">',
  '            <skipped/>',
  '        </testcase>',
  '        <testcase classname="src/features/transfer/domain/__tests__/daily-limit.test.ts" name="formats Zoë Ørsted-Ñúñez without transliteration" time="0.001">',
  '        </testcase>',
  '    </testsuite>',
  '    <testsuite name="src/features/refund/composables/__tests__/use-refund.test.ts" tests="1" failures="0" errors="0" skipped="0" time="0.21">',
  '        <testcase classname="src/features/refund/composables/__tests__/use-refund.test.ts" name="useRefund &gt; [B2] refuses a refund 31 days after purchase" time="0.2">',
  '        </testcase>',
  '    </testsuite>',
  '</testsuites>',
].join('\r\n');

export const jestReport = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="jest tests" tests="2" failures="1" errors="0" time="1.2">
  <testsuite name="[B4] transfers" errors="0" failures="1" skipped="0" timestamp="2026-10-24T00:00:00" time="1.1" tests="2">
    <testcase classname="[B4] transfers rejects a negative amount" name="[B4] transfers rejects a negative amount" time="0.004">
      <failure>Error: expect(received).toThrow(expected)

Expected substring: "negative"
    at Object.&lt;anonymous&gt; (/Users/dev/Zahlungs Dienst é/src/transfer.test.ts:9:5)</failure>
    </testcase>
    <testcase classname="[B4] transfers accepts 0.01" name="[B4] transfers accepts 0.01" time="0.001">
    </testcase>
  </testsuite>
</testsuites>`;

export const pytestReport = `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest" errors="1" failures="0" skipped="0" tests="2" time="0.05"><testcase classname="tests.test_refund" name="test_b7_refund_window[B7]" time="0.001"><error message="ModuleNotFoundError: No module named 'refunds.policy'">E   ModuleNotFoundError</error></testcase><testcase classname="tests.test_refund" name="test_untagged" time="0.001"/></testsuite></testsuites>`;
