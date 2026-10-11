import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectClients, initClients, manualServerConfig } from '@/shell/clients/init-clients';
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

  it('registers both role servers in Claude Code at local scope from the repository root', async () => {
    const repo = await createGitRepo(workspace().root, 'Checkout Service ü', { commit: true });
    const fake = await installFakeClaude(workspace().root);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    await fs.mkdir(path.join(repo, 'packages', 'api'), { recursive: true });

    const outcome = await initClients(path.join(repo, 'packages', 'api'), ['claude-code'], NOW);

    expect(outcome.registrations).toMatchObject([{ id: 'claude-code', ok: true }]);
    const adds = (await fake.calls()).filter((call) => call[2] === 'add-json');
    expect(adds.map((call) => [call[0], call.slice(1, 6)])).toEqual([
      [`cwd=${repo}`, ['mcp', 'add-json', '--scope', 'local', 'pacties-planner']],
      [`cwd=${repo}`, ['mcp', 'add-json', '--scope', 'local', 'pacties-tester']],
    ]);
    const plannerEntry = JSON.parse(adds[0]![6]!);
    expect(plannerEntry.type).toBe('stdio');
    expect(plannerEntry.args.slice(-5)).toEqual(['mcp', '--role', 'planner', '--repo', repo]);
  });

  it('merges both servers into the Cursor config without touching the user\'s servers', async () => {
    const repo = await createGitRepo(workspace().root, 'checkout', { commit: true });
    const cursorHome = path.join(workspace().root, 'cursor home');
    vi.stubEnv('PACTIES_CURSOR_HOME', cursorHome);
    await fs.mkdir(cursorHome, { recursive: true });
    const userServer = { command: 'docker', args: ['run', '-i', 'ghcr.io/github/github-mcp-server'], env: { GITHUB_TOKEN: '${env:GH}' } };
    await fs.writeFile(path.join(cursorHome, 'mcp.json'), JSON.stringify({ mcpServers: { github: userServer } }));

    const outcome = await initClients(repo, ['cursor'], NOW);

    expect(outcome.registrations).toMatchObject([{ id: 'cursor', ok: true }]);
    const written = JSON.parse(await fs.readFile(path.join(cursorHome, 'mcp.json'), 'utf8'));
    expect(written.mcpServers.github).toEqual(userServer);
    expect(written.mcpServers['pacties-tester'].args.slice(-5)).toEqual(['mcp', '--role', 'tester', '--repo', '${workspaceFolder}']);
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

  it('points both servers at the repository root', async () => {
    const repo = await createGitRepo(workspace().root, 'Checkout Service ü', { commit: false });
    const printed = (await manualServerConfig(path.join(repo))) as { mcpServers: Record<string, { args: string[] }> };
    expect(Object.keys(printed.mcpServers)).toEqual(['pacties-planner', 'pacties-tester']);
    expect(printed.mcpServers['pacties-planner']!.args.at(-1)).toBe(repo);
  });
});
