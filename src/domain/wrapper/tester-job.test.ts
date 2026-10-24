import { describe, expect, it } from 'vitest';
import { buildTesterJobPrompt, parseStreamLine, pendingTestWork, workKey } from '@/domain/wrapper/tester-job';
import { approve, ledgerOf, propose, proposeMany, recordResults, reject, revise, submitTests } from '@/test-support/ledger-script';
import { transferOverDailyLimit } from '@/test-support/behavior-fixtures';

describe('pendingTestWork', () => {
  it('lists approved and stale behaviors whose tests do not target the current version, in numeric order', () => {
    let events = approve(propose(proposeMany([], 9), transferOverDailyLimit), 'B10', 'B2', 'B9');
    events = submitTests(events, 'B9');
    events = recordResults(events, 'run-1', [{ id: 'B9', passed: 3, failed: 0 }]);
    events = reject(events, 'B4', 'out of scope');
    events = revise(events, { id: 'B9', contract: { dependsOn: ['refund_window() -> Days'] }, reason: 'window is configurable' });
    events = approve(events, 'B9');
    expect(pendingTestWork(ledgerOf(events))).toEqual([
      { id: 'B2', version: 1 },
      { id: 'B9', version: 2 },
      { id: 'B10', version: 1 },
    ]);
  });

  it('is empty while everything is planned or covered', () => {
    let events = approve(proposeMany([], 3), 'B3');
    events = submitTests(events, 'B3');
    expect(pendingTestWork(ledgerOf(events))).toEqual([]);
  });

  it('keys work by id and version', () => {
    expect(workKey({ id: 'B10', version: 3 })).toBe('B10@v3');
  });
});

describe('buildTesterJobPrompt', () => {
  it('names every behavior with its version and the tools to use', () => {
    const prompt = buildTesterJobPrompt([{ id: 'B2', version: 1 }, { id: 'B10', version: 3 }]);
    expect(prompt).toContain('New approved behaviors need tests: B2 v1, B10 v3.');
    expect(prompt).toContain('submit_tests');
    expect(prompt).toContain('report_contract_issue');
  });
});

describe('parseStreamLine', () => {
  it('reads the session id from the init line', () => {
    expect(parseStreamLine('{"type":"system","subtype":"init","session_id":"5f1c-é","tools":[]}')).toEqual({ kind: 'session', sessionId: '5f1c-é' });
  });

  it('turns a tester tool call into a short log entry without the MCP prefix', () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__pacties-tester__submit_tests', input: { behaviors: [{ id: 'B2', version: 1 }, { id: 'B10', version: 3 }] } }] } });
    expect(parseStreamLine(line)).toEqual({ kind: 'log', entry: { kind: 'tool', text: 'submit_tests B2, B10' } });
  });

  it('shows the file a Write touches and the first line of assistant text', () => {
    const write = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'src/zahlung é/__tests__/limit.test.ts', content: 'x' } }] } });
    expect(parseStreamLine(write)).toEqual({ kind: 'log', entry: { kind: 'tool', text: 'Write src/zahlung é/__tests__/limit.test.ts' } });
    const text = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '\n\nCovering B10 first.\r\nThen B2.' }] } });
    expect(parseStreamLine(text)).toEqual({ kind: 'log', entry: { kind: 'text', text: 'Covering B10 first.' } });
  });

  it('reads the final result, success or error, with its session id', () => {
    expect(parseStreamLine('{"type":"result","subtype":"success","is_error":false,"result":"Covered B2 and B10.\\nB9 open.","session_id":"s-1"}')).toEqual({
      kind: 'result',
      sessionId: 's-1',
      entry: { kind: 'result', text: 'Covered B2 and B10.' },
    });
    expect(parseStreamLine('{"type":"result","subtype":"error_max_turns","is_error":true}')).toEqual({
      kind: 'result',
      sessionId: null,
      entry: { kind: 'error', text: 'error_max_turns' },
    });
  });

  it('ignores blank lines and lines it does not care about, and logs non-JSON output as an error', () => {
    expect(parseStreamLine('   ')).toBeNull();
    expect(parseStreamLine('{"type":"user","message":{"content":[{"type":"tool_result"}]}}')).toBeNull();
    expect(parseStreamLine('{"type":"assistant","message":{"content":"plain"}}')).toBeNull();
    expect(parseStreamLine('Error: Invalid API key')).toEqual({ kind: 'log', entry: { kind: 'error', text: 'Error: Invalid API key' } });
    expect(parseStreamLine('[1,2]')).toEqual({ kind: 'log', entry: { kind: 'error', text: '[1,2]' } });
  });

  it('truncates very long entries', () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'é'.repeat(500) }] } });
    const parsed = parseStreamLine(line);
    expect(parsed?.kind === 'log' ? parsed.entry.text.length : 0).toBe(160);
  });
});
