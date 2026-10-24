import { describe, expect, it } from 'vitest';
import { buildPlannerClaudeArgs, buildPlannerSessionSettings, knownPlannerSessionId, readPlannerReport } from '@/domain/clients/planner-session';

describe('buildPlannerSessionSettings', () => {
  it('reports idle when Claude stops and busy when you submit a prompt, with safely quoted paths', () => {
    const settings = buildPlannerSessionSettings({ command: '/opt/node 26/bin/node', args: ["/opt/pacties's cli.js"] }, '/h é/planner-session/activity');
    expect(settings).toEqual({
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: "'/opt/node 26/bin/node' '/opt/pacties'\\''s cli.js' 'hook' 'planner-state' '/h é/planner-session/activity' 'idle'" }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: "'/opt/node 26/bin/node' '/opt/pacties'\\''s cli.js' 'hook' 'planner-state' '/h é/planner-session/activity' 'busy'" }] }],
      },
    });
  });
});

describe('buildPlannerClaudeArgs', () => {
  it.each([
    [{ kind: 'new', sessionId: '0d7e-new' }, ['--session-id', '0d7e-new']],
    [{ kind: 'resume', sessionId: '9a1c-old' }, ['--resume', '9a1c-old']],
    [{ kind: 'pick' }, ['--resume']],
    [{ kind: 'continue' }, ['--continue']],
  ] as const)('starts %j with the session flags and only the pacties hooks on top of your normal settings', (launch, flags) => {
    expect(buildPlannerClaudeArgs('/p é/settings.json', launch)).toEqual([...flags, '--settings', '/p é/settings.json']);
  });
});

describe('knownPlannerSessionId', () => {
  it('knows the session up front only for a new or an explicitly resumed session', () => {
    expect(knownPlannerSessionId({ kind: 'new', sessionId: 'a' })).toBe('a');
    expect(knownPlannerSessionId({ kind: 'resume', sessionId: 'b' })).toBe('b');
    expect(knownPlannerSessionId({ kind: 'pick' })).toBeNull();
    expect(knownPlannerSessionId({ kind: 'continue' })).toBeNull();
  });
});

describe('readPlannerReport', () => {
  it('takes the activity from the hook and the session id from its input', () => {
    expect(readPlannerReport('idle', { session_id: 'f00d-é', hook_event_name: 'Stop' })).toEqual({ activity: 'idle', sessionId: 'f00d-é' });
  });

  it.each([null, 'text', [], {}, { session_id: '' }, { session_id: 7 }])('reports no session for hook input %j', (input) => {
    expect(readPlannerReport('busy', input)).toEqual({ activity: 'busy', sessionId: null });
  });

  it('ignores an unknown activity', () => {
    expect(readPlannerReport('sleepy', { session_id: 'x' })).toBeNull();
  });
});
