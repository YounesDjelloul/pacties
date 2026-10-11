import { describe, expect, it } from 'vitest';
import { buildServerSpecs, chooseLauncher } from '@/domain/clients/server-specs';

describe('chooseLauncher', () => {
  it('uses the installed binary when pacties is on PATH', () => {
    expect(chooseLauncher(true)).toEqual({ command: 'pacties', args: [] });
  });

  it('falls back to npx otherwise', () => {
    expect(chooseLauncher(false)).toEqual({ command: 'npx', args: ['-y', 'pacties'] });
  });
});

describe('buildServerSpecs', () => {
  it('builds one server per role with the repository passed through verbatim', () => {
    expect(buildServerSpecs({ command: 'npx', args: ['-y', 'pacties'] }, '/Users/zoë/Code/Payments API')).toEqual([
      { name: 'pacties-planner', command: 'npx', args: ['-y', 'pacties', 'mcp', '--role', 'planner', '--repo', '/Users/zoë/Code/Payments API'] },
      { name: 'pacties-tester', command: 'npx', args: ['-y', 'pacties', 'mcp', '--role', 'tester', '--repo', '/Users/zoë/Code/Payments API'] },
    ]);
  });
});
