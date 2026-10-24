import { describe, expect, it } from 'vitest';
import { buildTesterClaudeArgs, buildTesterJobArgs, buildTesterSessionFiles, decideGuard, findUnsafeUserSettings, guardedPaths } from '@/domain/clients/tester-session';
import type { TesterSessionInput } from '@/domain/clients/types';

const input: TesterSessionInput = {
  repoRoot: '/Users/zoë/Code/Zahlungs Dienst é',
  worktrees: ['/Users/zoë/Code/Zahlungs Dienst é', '/Users/zoë/Code/zahlung-hotfix/'],
  privatePaths: ['/Users/zoë/.pacties/projects', '/Users/zoë/.pacties/repos.json', '/Users/zoë/.claude/projects/'],
  launcher: { command: '/opt/node 26/bin/node', args: ["/opt/pacties's/dist/cli/index.js"] },
  guardFile: '/Users/zoë/.pacties/projects/zahlung-1a2b/tester-session/guard.json',
};

describe('guardedPaths', () => {
  it('dedupes the repository, its worktrees and the private paths, without trailing slashes', () => {
    expect(guardedPaths(input)).toEqual([
      '/Users/zoë/.claude/projects',
      '/Users/zoë/.pacties/projects',
      '/Users/zoë/.pacties/repos.json',
      '/Users/zoë/Code/Zahlungs Dienst é',
      '/Users/zoë/Code/zahlung-hotfix',
    ]);
  });

  it('never guards the filesystem root', () => {
    expect(guardedPaths({ ...input, worktrees: ['/'], privatePaths: [] })).toEqual(['/Users/zoë/Code/Zahlungs Dienst é']);
  });
});

describe('buildTesterSessionFiles', () => {
  const files = buildTesterSessionFiles(input);

  it('denies reading and editing every guarded path and everything under it with absolute permission rules', () => {
    const deny = (files.settings['permissions'] as { deny: string[] }).deny;
    expect(deny).toContain('Read(//Users/zoë/Code/Zahlungs Dienst é/**)');
    expect(deny).toContain('Edit(//Users/zoë/Code/zahlung-hotfix/**)');
    expect(deny).toContain('Read(//Users/zoë/.claude/projects/**)');
    expect(deny).toContain('Read(//Users/zoë/.pacties/repos.json)');
    expect(deny).toHaveLength(20);
  });

  it('turns on the shell sandbox with no escape hatch and no bypass mode', () => {
    expect(files.settings['sandbox']).toEqual({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: { denyRead: guardedPaths(input) },
    });
    expect(files.settings['permissions']).toMatchObject({ disableBypassPermissionsMode: 'disable' });
  });

  it('installs the guard hook on every tool with a safely quoted command', () => {
    expect(files.settings['hooks']).toEqual({
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command:
                "'/opt/node 26/bin/node' '/opt/pacties'\\''s/dist/cli/index.js' 'hook' 'tester-guard' '/Users/zoë/.pacties/projects/zahlung-1a2b/tester-session/guard.json'",
            },
          ],
        },
      ],
    });
  });

  it('gives the session only the tester server', () => {
    expect(files.mcpConfig).toEqual({
      mcpServers: {
        'pacties-tester': {
          type: 'stdio',
          command: '/opt/node 26/bin/node',
          args: ["/opt/pacties's/dist/cli/index.js", 'mcp', '--role', 'tester', '--repo', '/Users/zoë/Code/Zahlungs Dienst é'],
        },
      },
    });
    expect(files.guard).toEqual({ guarded: guardedPaths(input) });
  });
});

describe('buildTesterClaudeArgs', () => {
  it('loads the generated settings and only the generated MCP config', () => {
    const args = buildTesterClaudeArgs('/s/settings.json', '/s/mcp.json');
    expect(args.slice(0, 5)).toEqual(['--settings', '/s/settings.json', '--strict-mcp-config', '--mcp-config', '/s/mcp.json']);
    expect(args[5]).toBe('--append-system-prompt');
    expect(args[6]).toContain('You are the pacties tester.');
  });
});

describe('buildTesterJobArgs', () => {
  it('runs headless with streamed JSON, the tester settings and MCP config, auto-accepted edits and the tester tools', () => {
    const args = buildTesterJobArgs('/s é/settings.json', '/s é/mcp.json', 'New approved behaviors need tests: B10 v2.', null);
    expect(args.slice(0, 5)).toEqual(['-p', 'New approved behaviors need tests: B10 v2.', '--output-format', 'stream-json', '--verbose']);
    expect(args).toEqual(expect.arrayContaining(['--settings', '/s é/settings.json', '--strict-mcp-config', '--mcp-config', '/s é/mcp.json']));
    expect(args.slice(-4)).toEqual(['--permission-mode', 'acceptEdits', '--allowedTools', 'mcp__pacties-tester']);
  });

  it('resumes the previous tester session when there is one', () => {
    expect(buildTesterJobArgs('/s', '/m', 'p', '0f9c-session').slice(-2)).toEqual(['--resume', '0f9c-session']);
  });
});

describe('decideGuard', () => {
  const guarded = guardedPaths(input);

  it.each([
    ['a Read of an implementation file', { file_path: '/Users/zoë/Code/Zahlungs Dienst é/src/limit.ts' }],
    ['a Bash command quoting the repository in another case', { command: 'cat "/users/ZOË/code/zahlungs dienst é/src/limit.ts"' }],
    ['a decomposed unicode spelling of the path', { file_path: '/Users/zoe\u0308/Code/Zahlungs Dienst e\u0301/src/limit.ts'.normalize('NFD') }],
    ['a Grep nested in arrays', { patterns: [{ path: '/Users/zoë/Code/zahlung-hotfix' }] }],
    ['a read of the pacties ledger', { file_path: '/Users/zoë/.pacties/projects/zahlung-1a2b/events.jsonl' }],
    ['a read of another session transcript', { file_path: '/Users/zoë/.claude/projects/-Users-zo--Code/abc.jsonl' }],
  ])('blocks %s', (_, toolInput) => {
    expect(decideGuard(toolInput, guarded)).toMatchObject({ blocked: true });
  });

  it.each([
    ['a workspace file', { file_path: '/Users/zoë/.pacties/workspaces/zahlung-1a2b/src/__tests__/limit.test.ts' }],
    ['a relative test path', { file_path: 'src/__tests__/limit.test.ts' }],
    ['an MCP call without paths', { behaviors: [{ id: 'B10', version: 2 }] }],
    ['no input at all', null],
  ])('allows %s', (_, toolInput) => {
    expect(decideGuard(toolInput, guarded)).toEqual({ blocked: false, reason: null });
  });
});

describe('findUnsafeUserSettings', () => {
  it('flags excluded sandbox commands', () => {
    expect(findUnsafeUserSettings({ sandbox: { excludedCommands: ['docker', 'git'] } })).toEqual([
      'sandbox.excludedCommands (docker, git) would run outside the sandbox',
    ]);
  });

  it.each([null, undefined, 'text', [], {}, { sandbox: {} }, { sandbox: { excludedCommands: [] } }, { sandbox: [] }])('accepts %j', (settings) => {
    expect(findUnsafeUserSettings(settings)).toEqual([]);
  });
});
