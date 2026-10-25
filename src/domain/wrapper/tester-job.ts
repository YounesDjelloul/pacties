import { compareBehaviorIds } from '@/domain/ledger/behavior-ids';
import type { ApprovalRequest, Ledger } from '@/domain/ledger/types';
import type { JobLogEntry, StreamEvent } from '@/domain/wrapper/types';

const MAX_LOG_TEXT = 160;

export function pendingTestWork(ledger: Ledger): ApprovalRequest[] {
  return ledger.behaviors
    .filter((behavior) => behavior.approvedAt !== null && behavior.status !== 'rejected' && behavior.testedVersion !== behavior.version)
    .map((behavior) => ({ id: behavior.id, version: behavior.version }))
    .sort((left, right) => compareBehaviorIds(left.id, right.id));
}

export function workKey(request: ApprovalRequest): string {
  return `${request.id}@v${request.version}`;
}

export function buildTesterJobPrompt(requests: ApprovalRequest[]): string {
  const list = requests.map((request) => `${request.id} v${request.version}`).join(', ');
  return [
    `New approved behaviors need tests: ${list}.`,
    'Call get_delta, read each contract, then write or update the tests following the repository conventions, tagging every test with its behavior id.',
    'Call submit_tests for the behaviors you covered, then run_tests.',
    'If a contract is unclear or missing something you need, call report_contract_issue instead of guessing.',
    'Finish with a two-line summary of what you covered and what is still open.',
  ].join(' ');
}

export function parseStreamLine(line: string): StreamEvent | null {
  const message = parseObject(line);
  if (message === null) {
    return line.trim().length === 0 ? null : { kind: 'log', entry: { kind: 'error', text: line.trim() } };
  }

  if (message['type'] === 'system' && typeof message['session_id'] === 'string') {
    return { kind: 'session', sessionId: message['session_id'] };
  }
  if (message['type'] === 'result') {
    const isError = message['is_error'] === true;
    const errorText = typeof message['result'] === 'string' ? message['result'] : String(message['subtype'] ?? 'failed');
    return {
      kind: 'result',
      sessionId: typeof message['session_id'] === 'string' ? message['session_id'] : null,
      entry: isError ? { kind: 'error', text: errorText.trim() } : { kind: 'result', text: 'Tester job finished' },
    };
  }
  if (message['type'] === 'assistant') {
    const entry = assistantEntry(message['message']);
    return entry === null ? null : { kind: 'log', entry };
  }
  return null;
}

function assistantEntry(payload: unknown): JobLogEntry | null {
  const content = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)['content'] : undefined;
  if (!Array.isArray(content)) {
    return null;
  }
  for (const block of content as Array<Record<string, unknown>>) {
    if (block['type'] === 'tool_use' && typeof block['name'] === 'string') {
      return { kind: 'tool', text: shorten(`${toolLabel(block['name'])} ${describeInput(block['input'])}`.trim()) };
    }
    if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim().length > 0) {
      return { kind: 'text', text: block['text'].trim() };
    }
  }
  return null;
}

function toolLabel(name: string): string {
  return name.replace(/^mcp__pacties-tester__/u, '');
}

function describeInput(input: unknown): string {
  if (typeof input !== 'object' || input === null) {
    return '';
  }
  const fields = input as Record<string, unknown>;
  const primary = fields['file_path'] ?? fields['command'] ?? fields['pattern'] ?? fields['id'];
  if (typeof primary === 'string') {
    return primary;
  }
  const behaviors = fields['behaviors'];
  if (Array.isArray(behaviors)) {
    return behaviors.map((behavior) => (typeof behavior === 'object' && behavior !== null ? String((behavior as Record<string, unknown>)['id']) : '')).join(', ');
  }
  return '';
}

function parseObject(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function shorten(text: string): string {
  const firstLine = text.split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim() ?? '';
  return firstLine.length > MAX_LOG_TEXT ? `${firstLine.slice(0, MAX_LOG_TEXT - 1)}…` : firstLine;
}
