import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTesterToolUse, launchTester } from '@/shell/clients/launch-tester';
import { ValidationError } from '@/lib/errors';
import { addWorktree, createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';

const NOW = new Date('2026-10-25T00:00:00.000Z');
const LAUNCHER = { command: '/opt/node 26/bin/node', args: ['/opt/pacties é/dist/cli/index.js'] };

async function installFakeClaude(root: string, exitCode: number): Promise<{ bin: string; call: () => Promise<string[]> }> {
  const bin = path.join(root, 'fake bin', 'claude');
  const log = path.join(root, 'claude-session.log');
  await fs.mkdir(path.dirname(bin), { recursive: true });
  await fs.writeFile(bin, ['#!/bin/sh', `{ printf 'cwd=%s\\n' "$(pwd -P)"; for arg in "$@"; do printf '%s\\n' "$arg"; done; } > "${log}"`, `exit ${exitCode}`].join('\n'), {
    mode: 0o755,
  });
  return { bin, call: async () => (await fs.readFile(log, 'utf8')).trimEnd().split('\n') };
}

describe('launchTester', () => {
  const workspace = useTempWorkspace();
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function setUp() {
    const project = await createTempProject(workspace());
    await fs.writeFile(path.join(project.repoRoot, 'package.json'), '{ "devDependencies": { "vitest": "^5.0.3" } }');
    await fs.mkdir(path.join(project.repoRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(project.repoRoot, 'src/limit.ts'), 'export const limit = 10_000;\n');
    await fs.writeFile(path.join(project.repoRoot, 'src/limit.test.ts'), "it('[B1] holds', () => {})\n");
    const claudeHome = path.join(workspace().root, 'claude home');
    await fs.mkdir(claudeHome, { recursive: true });
    vi.stubEnv('PACTIES_CLAUDE_HOME', claudeHome);
    return { project, claudeHome };
  }

  it('syncs the workspace and starts Claude Code in it with the tester-only settings and MCP config', async () => {
    const { project, claudeHome } = await setUp();
    const hotfix = await addWorktree(project.repoRoot, path.join(workspace().root, 'zahlung hotfix'));
    const fake = await installFakeClaude(workspace().root, 0);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);

    const launch = await launchTester(project.repoRoot, LAUNCHER, NOW);

    expect(launch.sync.pulled.sort()).toEqual(['package.json', 'src/limit.test.ts']);
    expect(launch.exitCode).toBe(0);
    const [cwd, ...args] = await fake.call();
    expect(cwd).toBe(`cwd=${await fs.realpath(launch.workspace)}`);
    expect(args.slice(0, 5)).toEqual([
      '--settings',
      path.join(project.dir, 'tester-session', 'settings.json'),
      '--strict-mcp-config',
      '--mcp-config',
      path.join(project.dir, 'tester-session', 'mcp.json'),
    ]);

    const settings = JSON.parse(await fs.readFile(path.join(project.dir, 'tester-session', 'settings.json'), 'utf8'));
    expect(settings.sandbox.filesystem.denyRead).toEqual(
      expect.arrayContaining([project.repoRoot, await fs.realpath(hotfix), path.join(workspace().home, 'projects'), path.join(claudeHome, 'projects')]),
    );
    const mcp = JSON.parse(await fs.readFile(path.join(project.dir, 'tester-session', 'mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['pacties-tester']);
    expect(await fs.access(path.join(launch.workspace, 'src/limit.ts')).then(() => true, () => false)).toBe(false);
  });

  it('passes the session exit code back', async () => {
    const { project } = await setUp();
    vi.stubEnv('PACTIES_CLAUDE_BIN', (await installFakeClaude(workspace().root, 3)).bin);
    expect((await launchTester(project.repoRoot, LAUNCHER, NOW)).exitCode).toBe(3);
  });

  it('refuses to launch when user settings run commands outside the sandbox', async () => {
    const { project, claudeHome } = await setUp();
    await fs.writeFile(path.join(claudeHome, 'settings.json'), JSON.stringify({ sandbox: { excludedCommands: ['docker'] } }));
    vi.stubEnv('PACTIES_CLAUDE_BIN', (await installFakeClaude(workspace().root, 0)).bin);
    await expect(launchTester(project.repoRoot, LAUNCHER, NOW)).rejects.toThrow(ValidationError);
  });

  it('guards tool calls with the paths written at launch, and blocks when the guard file is missing', async () => {
    const { project } = await setUp();
    vi.stubEnv('PACTIES_CLAUDE_BIN', (await installFakeClaude(workspace().root, 0)).bin);
    const launch = await launchTester(project.repoRoot, LAUNCHER, NOW);
    const guardFile = path.join(project.dir, 'tester-session', 'guard.json');

    const hookInput = (toolInput: unknown) => ({ session_id: 's', transcript_path: path.join(workspace().root, 'claude home', 'projects', 'x.jsonl'), tool_name: 'Read', tool_input: toolInput });
    expect(await checkTesterToolUse(guardFile, hookInput({ file_path: path.join(project.repoRoot, 'src/limit.ts') }))).toMatchObject({ blocked: true });
    expect(await checkTesterToolUse(guardFile, hookInput({ file_path: path.join(launch.workspace, 'src/limit.test.ts') }))).toEqual({ blocked: false, reason: null });
    expect(await checkTesterToolUse(path.join(workspace().root, 'missing guard.json'), hookInput({}))).toMatchObject({ blocked: true });
  });
});
