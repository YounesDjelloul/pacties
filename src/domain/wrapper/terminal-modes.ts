const PRIVATE_MODE = /\u001b\[\?([0-9;]+)([hl])/gu;
const TAIL_LENGTH = 24;
const ALTERNATE_SCREEN_MODES = ['1049', '1047', '47'];
const INPUT_MODES = ['1000', '1002', '1003', '1005', '1006', '1015', '1004'];
const RESTORED_MODES = [...INPUT_MODES, '2004', '25'];

export type PlannerModes = {
  modes: Record<string, boolean>;
  tail: string;
};

export const INITIAL_PLANNER_MODES: PlannerModes = { modes: {}, tail: '' };

export function trackPlannerModes(tracked: PlannerModes, output: string): PlannerModes {
  const text = tracked.tail + output;
  const modes = { ...tracked.modes };
  let consumedUntil = 0;
  for (const match of text.matchAll(PRIVATE_MODE)) {
    for (const mode of (match[1] ?? '').split(';')) {
      modes[mode] = match[2] === 'h';
    }
    consumedUntil = (match.index ?? 0) + match[0].length;
  }
  return { modes, tail: text.slice(Math.max(consumedUntil, text.length - TAIL_LENGTH)) };
}

export function usesAlternateScreen(tracked: PlannerModes): boolean {
  return ALTERNATE_SCREEN_MODES.some((mode) => tracked.modes[mode] === true);
}

export function pauseInputModes(tracked: PlannerModes): string {
  return INPUT_MODES.filter((mode) => tracked.modes[mode] === true)
    .map((mode) => `\u001b[?${mode}l`)
    .join('');
}

export function restoreModes(tracked: PlannerModes): string {
  return RESTORED_MODES.filter((mode) => tracked.modes[mode] !== undefined)
    .map((mode) => `\u001b[?${mode}${tracked.modes[mode] ? 'h' : 'l'}`)
    .join('');
}

export function terminalTitle(text: string): string {
  return `\u001b]2;${text.replace(/[\u0000-\u001f\u007f]/gu, ' ')}\u0007`;
}
