import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectClients, initClients, manualServerConfig, removeClients } from '@/shell/clients/init-clients';
import { resolveProject } from '@/shell/project/resolve-project';
import { ValidationError } from '@/lib/errors';
import { createGitRepo, useTempWorkspace } from '@/test-support/temp-workspace';

const NOW = new Date('2026-10-25T00:00:00.000Z');

async function installFakeClaude(root: string): Promise<{ bin: string; calls: () => Promise<string[][]> }> {
  const bin = path.join(root, 'fake bin', 'claude');
  const log = path.join(root, 'claude-calls.log');
  await fs.mkdir(path.dirname(bin), { recursive: true });
  await fs.writeFile(
    bin,
    [
      '#!/bin/sh',
      `{ printf 'cwd=%s\\n' "$(pwd -P)"; for arg in "$@"; do printf '%s\\n' "$arg"; done; printf '%s\\n' '---'; } >> "${log}"`,
      'if [ "$2" = "remove" ]; then echo "No MCP server found" >&2; exit 1; fi',
      'exit 0',
    ].join('\n'),
    { mode: 0o755 },
  );
  return {
    bin,
    calls: async () =>
      (await fs.readFile(log, 'utf8'))
        .split('---\n')
        .filter((call) => call.length > 0)
        .map((call) => call.trimEnd().split('\n')),
  };
}

describe('initClients', () => {
  const workspace = useTempWorkspace();
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers only the planner in Claude Code at local scope from the repository root, and removes an old tester entry', async () => {
    const repo = await createGitRepo(workspace().root, 'Checkout Service ü', { commit: true });
    const fake = await installFakeClaude(workspace().root);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    await fs.mkdir(path.join(repo, 'packages', 'api'), { recursive: true });

    const outcome = await initClients(path.join(repo, 'packages', 'api'), ['claude-code'], NOW);

    expect(outcome.registrations).toMatchObject([{ id: 'claude-code', ok: true }]);
    const adds = (await fake.calls()).filter((call) => call[2] === 'add-json');
    expect(adds.map((call) => [call[0], call.slice(1, 6)])).toEqual([[`cwd=${repo}`, ['mcp', 'add-json', '--scope', 'local', 'pacties-planner']]]);
    const removes = (await fake.calls()).filter((call) => call[2] === 'remove').map((call) => call.at(-1));
    expect(removes).toEqual(['pacties-planner', 'pacties-tester']);
    const plannerEntry = JSON.parse(adds[0]![6]!);
    expect(plannerEntry.type).toBe('stdio');
    expect(plannerEntry.args.slice(-5)).toEqual(['mcp', '--role', 'planner', '--repo', repo]);
  });

  it('merges only the planner into the Cursor config, drops an old tester entry and keeps the user\'s servers', async () => {
    const repo = await createGitRepo(workspace().root, 'checkout', { commit: true });
    const cursorHome = path.join(workspace().root, 'cursor home');
    vi.stubEnv('PACTIES_CURSOR_HOME', cursorHome);
    await fs.mkdir(cursorHome, { recursive: true });
    const userServer = { command: 'docker', args: ['run', '-i', 'ghcr.io/github/github-mcp-server'], env: { GITHUB_TOKEN: '${env:GH}' } };
    const oldTester = { type: 'stdio', command: 'pacties', args: ['mcp', '--role', 'tester', '--repo', '${workspaceFolder}'] };
    await fs.writeFile(path.join(cursorHome, 'mcp.json'), JSON.stringify({ mcpServers: { github: userServer, 'pacties-tester': oldTester } }));

    const outcome = await initClients(repo, ['cursor'], NOW);

    expect(outcome.registrations).toMatchObject([{ id: 'cursor', ok: true }]);
    const written = JSON.parse(await fs.readFile(path.join(cursorHome, 'mcp.json'), 'utf8'));
    expect(written.mcpServers.github).toEqual(userServer);
    expect(Object.keys(written.mcpServers).sort()).toEqual(['github', 'pacties-planner']);
    expect(written.mcpServers['pacties-planner'].args.slice(-5)).toEqual(['mcp', '--role', 'planner', '--repo', '${workspaceFolder}']);
  });

  it('keeps going when one client fails and records only the successful ones', async () => {
    const repo = await createGitRepo(workspace().root, 'checkout', { commit: true });
    const fake = await installFakeClaude(workspace().root);
    const cursorHome = path.join(workspace().root, 'cursor home');
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    vi.stubEnv('PACTIES_CURSOR_HOME', cursorHome);
    await fs.mkdir(cursorHome, { recursive: true });
    await fs.writeFile(path.join(cursorHome, 'mcp.json'), '["not", "an", "object"]');

    const outcome = await initClients(repo, ['cursor', 'claude-code'], NOW);

    expect(outcome.registrations.map(({ id, ok }) => [id, ok])).toEqual([['cursor', false], ['claude-code', true]]);
    expect(outcome.registrations[0]?.detail).toContain('was left untouched: the MCP config file must contain a JSON object');
    expect(await fs.readFile(path.join(cursorHome, 'mcp.json'), 'utf8')).toBe('["not", "an", "object"]');
    expect(JSON.parse(await fs.readFile(path.join(workspace().home, 'config.json'), 'utf8'))).toEqual({ clients: ['claude-code'] });
  });

  it('reports a failing claude binary as a failed registration', async () => {
    const repo = await createGitRepo(workspace().root, 'checkout', { commit: true });
    vi.stubEnv('PACTIES_CLAUDE_BIN', path.join(workspace().root, 'missing', 'claude'));
    const outcome = await initClients(repo, ['claude-code'], NOW);
    expect(outcome.registrations).toMatchObject([{ id: 'claude-code', ok: false }]);
    expect(outcome.registrations[0]?.detail).toContain('"claude mcp add-json pacties-planner" failed');
  });

  it('refuses a folder outside any git repository', async () => {
    const folder = path.join(workspace().root, 'plain folder');
    await fs.mkdir(folder);
    await expect(initClients(folder, ['cursor'], NOW)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('the planner test guard', () => {
  const workspace = useTempWorkspace();
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const readJson = async (file: string) => JSON.parse(await fs.readFile(file, 'utf8'));
  const settingsOf = (repo: string) => readJson(path.join(repo, '.claude', 'settings.local.json'));

  async function claudeRepo(name = 'Checkout Service ü') {
    const repo = await createGitRepo(workspace().root, name, { commit: true });
    vi.stubEnv('PACTIES_CLAUDE_BIN', (await installFakeClaude(workspace().root)).bin);
    return repo;
  }

  it('denies the planner every test glob in local settings, keeps the user settings, and git-excludes the file', async () => {
    const repo = await claudeRepo();
    await fs.mkdir(path.join(repo, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(repo, '.claude', 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Bash(npm run test:*)'], deny: ['Read(./.env)'] }, outputStyle: 'Explanatory' }),
    );
    await fs.writeFile(path.join(repo, '.git', 'info', 'exclude'), '# git ls-files --others --exclude-from=.git/info/exclude\r\n*.log');

    const outcome = await initClients(repo, ['claude-code'], NOW);

    expect(outcome.registrations[0]?.detail).toContain('denied the planner 6 test-file rules');
    expect(await settingsOf(repo)).toEqual({
      permissions: {
        allow: ['Bash(npm run test:*)'],
        deny: ['Read(./.env)', 'Edit(**/*.test.*)', 'Edit(**/*.spec.*)', 'Edit(**/__tests__/**)', 'Edit(**/__snapshots__/**)', 'Edit(**/test-support/**)', 'Edit(e2e/**)'],
      },
      outputStyle: 'Explanatory',
    });
    expect(await fs.readFile(path.join(repo, '.git', 'info', 'exclude'), 'utf8')).toBe(
      '# git ls-files --others --exclude-from=.git/info/exclude\r\n*.log\n.claude/settings.local.json\n',
    );
  });

  it('replaces its own previous rules when the tester policy changes, without duplicating the exclude line', async () => {
    const repo = await claudeRepo();
    await initClients(repo, ['claude-code'], NOW);
    const project = await resolveProject(repo, NOW);
    await fs.writeFile(path.join(project.dir, 'tester.json'), JSON.stringify({ include: ['tests/**', '**/*.test.*'], testCommand: 'pytest --junitxml={junit}' }));

    await initClients(repo, ['claude-code'], NOW);

    expect((await settingsOf(repo)).permissions.deny).toEqual(['Edit(tests/**)', 'Edit(**/*.test.*)']);
    const exclude = await fs.readFile(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude.match(/settings\.local\.json/gu)).toHaveLength(1);
  });

  it('fails the Claude Code registration and leaves a malformed local settings file untouched', async () => {
    const repo = await claudeRepo();
    await fs.mkdir(path.join(repo, '.claude'), { recursive: true });
    await fs.writeFile(path.join(repo, '.claude', 'settings.local.json'), '{"permissions": {"deny": "Edit(**)"}}');

    const outcome = await initClients(repo, ['claude-code'], NOW);

    expect(outcome.registrations).toMatchObject([{ id: 'claude-code', ok: false }]);
    expect(outcome.registrations[0]?.detail).toContain('.claude/settings.local.json was left untouched');
    expect(await fs.readFile(path.join(repo, '.claude', 'settings.local.json'), 'utf8')).toBe('{"permissions": {"deny": "Edit(**)"}}');
  });

  it('removes pacties from every client, lifts only its own rules, and forgets the clients', async () => {
    const repo = await claudeRepo();
    const cursorHome = path.join(workspace().root, 'cursor home');
    vi.stubEnv('PACTIES_CURSOR_HOME', cursorHome);
    await fs.mkdir(cursorHome, { recursive: true });
    await fs.writeFile(path.join(cursorHome, 'mcp.json'), JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }));
    await initClients(repo, ['claude-code', 'cursor'], NOW);
    const settings = await settingsOf(repo);
    await fs.writeFile(path.join(repo, '.claude', 'settings.local.json'), JSON.stringify({ ...settings, permissions: { deny: ['Read(./.env)', ...settings.permissions.deny] } }));

    const outcome = await removeClients(repo, ['claude-code', 'cursor'], NOW);

    expect(outcome.registrations.map(({ id, ok }) => [id, ok])).toEqual([['claude-code', true], ['cursor', true]]);
    expect(outcome.registrations[0]?.detail).toContain('lifted 6 test-file rules');
    expect(await settingsOf(repo)).toEqual({ permissions: { deny: ['Read(./.env)'] } });
    expect((await readJson(path.join(cursorHome, 'mcp.json'))).mcpServers).toEqual({ github: { command: 'gh-mcp' } });
    expect(await readJson(path.join(workspace().home, 'config.json'))).toEqual({ clients: [] });
  });

  it('removes cleanly when pacties was never registered', async () => {
    const repo = await claudeRepo('never registered');
    vi.stubEnv('PACTIES_CURSOR_HOME', path.join(workspace().root, 'no cursor'));
    const outcome = await removeClients(repo, ['claude-code', 'cursor'], NOW);
    expect(outcome.registrations.map((registration) => [registration.ok, registration.detail])).toEqual([
      [true, 'pacties-planner was not registered; lifted 0 test-file rules'],
      [true, `${path.join(workspace().root, 'no cursor', 'mcp.json')} does not exist; nothing to remove`],
    ]);
  });
});

describe('detectClients', () => {
  const workspace = useTempWorkspace();
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detects Claude Code only when its binary answers', async () => {
    const fake = await installFakeClaude(workspace().root);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    expect((await detectClients()).find((client) => client.id === 'claude-code')?.detected).toBe(true);

    vi.stubEnv('PACTIES_CLAUDE_BIN', path.join(workspace().root, 'nope', 'claude'));
    expect((await detectClients()).find((client) => client.id === 'claude-code')?.detected).toBe(false);
  });

  it('detects Cursor through its config folder', async () => {
    const cursorHome = path.join(workspace().root, 'cursor home');
    await fs.mkdir(cursorHome);
    vi.stubEnv('PACTIES_CURSOR_HOME', cursorHome);
    expect((await detectClients()).find((client) => client.id === 'cursor')?.detected).toBe(true);
  });
});

describe('manualServerConfig', () => {
  const workspace = useTempWorkspace();

  it('points the planner server at the repository root and leaves the tester to "pacties tester"', async () => {
    const repo = await createGitRepo(workspace().root, 'Checkout Service ü', { commit: false });
    const printed = (await manualServerConfig(path.join(repo))) as { mcpServers: Record<string, { args: string[] }> };
    expect(Object.keys(printed.mcpServers)).toEqual(['pacties-planner']);
    expect(printed.mcpServers['pacties-planner']!.args.at(-1)).toBe(repo);
  });
});
