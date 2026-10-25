import { describe, expect, it } from 'vitest';
import { readPanelKeys, splitInput } from '@/domain/wrapper/keys';

describe('splitInput', () => {
  it('passes everything but Ctrl-\\ through unchanged, including escapes, unicode and pasted newlines', () => {
    const pasted = 'Zoë: transfer > 10 000,01 €\r\n\u001b[200~line two\u001b[201~\u001b[A';
    expect(splitInput(pasted)).toEqual([{ kind: 'bytes', text: pasted }]);
  });

  it('finds Ctrl-\\ anywhere in a chunk, several times', () => {
    expect(splitInput('ab\u001ccd\u001c\u001c')).toEqual([
      { kind: 'bytes', text: 'ab' },
      { kind: 'toggle_screen' },
      { kind: 'bytes', text: 'cd' },
      { kind: 'toggle_screen' },
      { kind: 'toggle_screen' },
    ]);
  });

  it('returns nothing for an empty chunk', () => {
    expect(splitInput('')).toEqual([]);
  });
});

describe('readPanelKeys', () => {
  it('reads arrows, vim keys, space, enter and commands', () => {
    expect(readPanelKeys('\u001b[A\u001bOBjk \r\na r q', false)).toEqual(['up', 'down', 'down', 'up', 'tick', 'enter', 'enter', 'approve', 'tick', 'reject', 'tick', 'quit']);
  });

  it('reads Page Up, Page Down and every common End sequence for scrolling the log', () => {
    expect(readPanelKeys('\u001b[5~\u001b[6~\u001b[F\u001bOF\u001b[4~\u001b[8~', false)).toEqual(['page_up', 'page_down', 'end', 'end', 'end', 'end']);
  });

  it('treats letters, spaces and j/k as text while typing a reason, but keeps enter, escape and backspace', () => {
    expect(readPanelKeys('jak é\u007f\r', true)).toEqual([{ char: 'j' }, { char: 'a' }, { char: 'k' }, { char: ' ' }, { char: 'é' }, 'backspace', 'enter']);
    expect(readPanelKeys('\u001b', true)).toEqual(['escape']);
  });

  it('skips unknown escape sequences such as right arrow or F5 instead of typing them', () => {
    expect(readPanelKeys('\u001b[C\u001b[15~x', true)).toEqual([{ char: 'x' }]);
  });

  it('ignores mouse and focus reports from a planner that tracks the mouse', () => {
    expect(readPanelKeys('\u001b[<35;12;7M\u001b[<0;3;4m\u001b[I\u001b[Oq', false)).toEqual(['quit']);
  });

  it('reads an emoji as one character', () => {
    expect(readPanelKeys('👍', true)).toEqual([{ char: '👍' }]);
  });
});
