import type { SourceFile, SourceIndex, TestCase, TesterTestCase } from '@/domain/testing/types';

export const MIN_REDACTED_LINE_LENGTH = 16;
export const MAX_TESTER_MESSAGE_LENGTH = 300;
export const REDACTION = '[redacted: matches implementation source]';

const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/gu;
const STACK_FRAME_PATTERN = /^\s*(at\s|❯\s|>\s*\d+\s*\||\d+\s*\|)/u;

export function buildSourceIndex(files: SourceFile[]): SourceIndex {
  const lines = new Set<string>();
  for (const file of files) {
    for (const line of file.content.split(/\r?\n/u)) {
      const normalized = normalizeLine(line);
      if (normalized.length >= MIN_REDACTED_LINE_LENGTH) {
        lines.add(normalized);
      }
    }
  }
  return { lines: [...lines] };
}

export function sanitizeForTester(cases: TestCase[], index: SourceIndex, hiddenPaths: string[]): TesterTestCase[] {
  return cases.map((testCase) => ({
    name: testCase.name,
    status: testCase.status,
    message: testCase.message === null ? null : sanitizeMessage(testCase.message, index, hiddenPaths),
  }));
}

function sanitizeMessage(message: string, index: SourceIndex, hiddenPaths: string[]): string {
  const firstLine = message
    .replace(ANSI_PATTERN, '')
    .split(/\r?\n/u)
    .find((line) => line.trim().length > 0 && !STACK_FRAME_PATTERN.test(line));
  if (firstLine === undefined) {
    return '';
  }

  const normalized = normalizeLine(firstLine);
  if (index.lines.some((sourceLine) => normalized.includes(sourceLine))) {
    return REDACTION;
  }

  const withoutPaths = hiddenPaths.reduce((text, hidden) => text.split(hidden).join('<repo>'), normalized);
  return withoutPaths.length > MAX_TESTER_MESSAGE_LENGTH ? `${withoutPaths.slice(0, MAX_TESTER_MESSAGE_LENGTH - 1)}…` : withoutPaths;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/gu, ' ').trim();
}
