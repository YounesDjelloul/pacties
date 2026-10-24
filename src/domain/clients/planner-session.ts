import { shellCommand } from '@/domain/clients/shell-command';
import type { Launcher } from '@/domain/clients/types';
import type { PlannerLaunch, PlannerReport } from '@/domain/wrapper/types';

export function buildPlannerSessionSettings(launcher: Launcher, activityFile: string): Record<string, unknown> {
  const hook = (activity: 'idle' | 'busy') => [{ hooks: [{ type: 'command', command: shellCommand(launcher, ['hook', 'planner-state', activityFile, activity]) }] }];
  return { hooks: { Stop: hook('idle'), UserPromptSubmit: hook('busy') } };
}

export function buildPlannerClaudeArgs(settingsFile: string, launch: PlannerLaunch): string[] {
  return [...launchArgs(launch), '--settings', settingsFile];
}

export function knownPlannerSessionId(launch: PlannerLaunch): string | null {
  return launch.kind === 'new' || launch.kind === 'resume' ? launch.sessionId : null;
}

export function readPlannerReport(activity: string, hookInput: unknown): PlannerReport | null {
  if (activity !== 'idle' && activity !== 'busy') {
    return null;
  }
  const sessionId = typeof hookInput === 'object' && hookInput !== null ? (hookInput as Record<string, unknown>)['session_id'] : undefined;
  return { activity, sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null };
}

function launchArgs(launch: PlannerLaunch): string[] {
  switch (launch.kind) {
    case 'new':
      return ['--session-id', launch.sessionId];
    case 'resume':
      return ['--resume', launch.sessionId];
    case 'pick':
      return ['--resume'];
    case 'continue':
      return ['--continue'];
  }
}
