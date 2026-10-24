import { describe, expect, it } from 'vitest';
import { buildPlannerServerSpec, chooseLauncher } from '@/domain/clients/server-specs';

describe('chooseLauncher', () => {
  it('uses the installed binary when pacties is on PATH', () => {
    expect(chooseLauncher(true)).toEqual({ command: 'pacties', args: [] });
  });

  it('falls back to npx otherwise', () => {
    expect(chooseLauncher(false)).toEqual({ command: 'npx', args: ['-y', 'pacties'] });
  });
});

describe('buildPlannerServerSpec', () => {
  it('builds only the planner server, with the repository passed through verbatim', () => {
    expect(buildPlannerServerSpec({ command: 'npx', args: ['-y', 'pacties'] }, '/Users/zoë/Code/Payments API')).toEqual({
      name: 'pacties-planner',
      command: 'npx',
      args: ['-y', 'pacties', 'mcp', '--role', 'planner', '--repo', '/Users/zoë/Code/Payments API'],
    });
  });
});
