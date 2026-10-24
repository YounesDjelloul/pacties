import type { InputSegment, PanelKey } from '@/domain/wrapper/types';

export const SWITCH_KEY = '\u001c';

const NAMED_KEYS: Record<string, PanelKey> = {
  '\u001b[A': 'up',
  '\u001bOA': 'up',
  k: 'up',
  '\u001b[B': 'down',
  '\u001bOB': 'down',
  j: 'down',
  ' ': 'tick',
  '\r': 'enter',
  '\n': 'enter',
  '\u001b': 'escape',
  '\u007f': 'backspace',
  '\b': 'backspace',
};

const COMMAND_KEYS: Record<string, PanelKey> = { a: 'approve', r: 'reject', q: 'quit' };

const UNKNOWN_ESCAPE_SEQUENCE = /^\u001b(?:\[[0-9;?]*[ -/]*[@-~]|O[A-Za-z])/u;

export function splitInput(chunk: string): InputSegment[] {
  const segments: InputSegment[] = [];
  chunk.split(SWITCH_KEY).forEach((text, index) => {
    if (index > 0) {
      segments.push({ kind: 'toggle_screen' });
    }
    if (text.length > 0) {
      segments.push({ kind: 'bytes', text });
    }
  });
  return segments;
}

export function readPanelKeys(text: string, typing: boolean): PanelKey[] {
  const keys: PanelKey[] = [];
  let rest = text;
  while (rest.length > 0) {
    const next = readNextPanelKey(rest, typing);
    if (next.key !== null) {
      keys.push(next.key);
    }
    rest = next.rest;
  }
  return keys;
}

export function readNextPanelKey(text: string, typing: boolean): { key: PanelKey | null; rest: string } {
  const sequence = Object.keys(NAMED_KEYS)
    .filter((candidate) => text.startsWith(candidate) && !(typing && candidate.length === 1 && /[ kj]/u.test(candidate)))
    .sort((left, right) => right.length - left.length)[0];
  if (sequence !== undefined && sequence !== '\u001b') {
    return { key: NAMED_KEYS[sequence]!, rest: text.slice(sequence.length) };
  }
  const unknown = UNKNOWN_ESCAPE_SEQUENCE.exec(text);
  if (unknown !== null) {
    return { key: null, rest: text.slice(unknown[0].length) };
  }
  if (sequence !== undefined) {
    return { key: NAMED_KEYS[sequence]!, rest: text.slice(sequence.length) };
  }
  const char = Array.from(text)[0]!;
  return { key: !typing && COMMAND_KEYS[char] !== undefined ? COMMAND_KEYS[char]! : { char }, rest: text.slice(char.length) };
}
