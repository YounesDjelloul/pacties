import { describe, expect, it } from 'vitest';
import { INITIAL_PLANNER_MODES, pauseInputModes, restoreModes, terminalTitle, trackPlannerModes, usesAlternateScreen } from '@/domain/wrapper/terminal-modes';

const claudeStartup = '\u001b7\u001b[r\u001b8\u001b[?25h\u001b[?2004h\u001b[?2031h\u001b[?1004h\u001b]0;✳ Claude Code\u0007\u001b[?1049h\u001b[2J\u001b[H\u001b[?1000h\u001b[?1002h\u001b[?1003h\u001b[?1006h\u001b[?25l\u001b[?2026h';

describe('trackPlannerModes', () => {
  it('reads the modes Claude Code turns on at startup', () => {
    const tracked = trackPlannerModes(INITIAL_PLANNER_MODES, claudeStartup);
    expect(usesAlternateScreen(tracked)).toBe(true);
    expect(tracked.modes).toMatchObject({ '1049': true, '1000': true, '1003': true, '1006': true, '1004': true, '2004': true, '25': false });
  });

  it('follows the latest switch, combined modes, and a sequence split across chunks', () => {
    const first = trackPlannerModes(INITIAL_PLANNER_MODES, 'Zoë \u001b[38;5;12m\u001b[?10');
    expect(usesAlternateScreen(first)).toBe(false);
    const second = trackPlannerModes(first, '49h\u001b[?1000;1006h');
    expect([usesAlternateScreen(second), second.modes['1000'], second.modes['1006']]).toEqual([true, true, true]);
    expect(usesAlternateScreen(trackPlannerModes(second, '\u001b[?1049l'))).toBe(false);
  });

  it('does not count a consumed switch twice', () => {
    const entered = trackPlannerModes(INITIAL_PLANNER_MODES, '\u001b[?1049h');
    const left = trackPlannerModes(entered, 'x\u001b[?1049l');
    expect(usesAlternateScreen(trackPlannerModes(left, 'more output'))).toBe(false);
  });
});

describe('pauseInputModes and restoreModes', () => {
  const tracked = trackPlannerModes(INITIAL_PLANNER_MODES, claudeStartup);

  it('switches off only the mouse and focus modes the planner turned on', () => {
    expect(pauseInputModes(tracked)).toBe('\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l\u001b[?1004l');
    expect(pauseInputModes(INITIAL_PLANNER_MODES)).toBe('');
  });

  it('puts back mouse, focus, paste and cursor visibility exactly as the planner left them', () => {
    expect(restoreModes(tracked)).toBe('\u001b[?1000h\u001b[?1002h\u001b[?1003h\u001b[?1006h\u001b[?1004h\u001b[?2004h\u001b[?25l');
  });
});

describe('terminalTitle', () => {
  it('wraps the text in a title sequence and strips control characters', () => {
    expect(terminalTitle('pacties · 2 to approve\u0007\u001b[31m')).toBe('\u001b]2;pacties · 2 to approve  [31m\u0007');
  });
});
