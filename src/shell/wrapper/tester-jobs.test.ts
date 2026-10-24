import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runTesterJob } from '@/shell/wrapper/tester-jobs';
import { createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';
import type { StreamEvent } from '@/domain/wrapper/types';

const LAUNCHER = { command: '/opt/node 26/bin/node', args: ['/opt/pacties é/dist/cli/index.js'] };

async function installFakeHeadlessClaude(root: string, exitCode: number): Promise<{ bin: string; calls: () => Promise<string[][]> }> {
  const bin = path.join(root, 'fake bin', 'claude');
  const log = path.join(root, 'claude-jobs.log');
  await fs.mkdir(path.dirname(bin), { recursive: true });
  await fs.writeFile(
    bin,
    [
      '#!/bin/sh',
      `{ printf 'cwd=%s\\n' "$(pwd -P)"; for arg in "$@"; do printf '%s\\n' "$arg"; done; printf '%s\\n' '---'; } >> "${log}"`,
      `echo '{"type":"system","subtype":"init","session_id":"tester-session-é"}'`,
      `echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__pacties-tester__get_delta","input":{}}]}}'`,
      'echo "not json at all"',
      `echo '{"type":"result","subtype":"success","is_error":false,"result":"Covered B10.","session_id":"tester-session-é"}'`,
      `echo 'rate limited' >&2`,
      `exit ${exitCode}`,
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

describe('runTesterJob', () => {
  const workspace = useTempWorkspace();

  async function setUp(exitCode: number) {
    const project = await createTempProject(workspace());
    await fs.writeFile(path.join(project.repoRoot, 'package.json'), '{ "devDependencies": { "vitest": "^5.0.3" } }');
    const fake = await installFakeHeadlessClaude(workspace().root, exitCode);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    return { project, fake };
  }

  it('runs claude headless in the sandbox, streams events, reports the tester session, and resumes it when asked', async () => {
    const { project, fake } = await setUp(0);
    const events: StreamEvent[] = [];

    const first = await runTesterJob(project, LAUNCHER, [{ id: 'B10', version: 2 }], null, (event) => events.push(event), new AbortController().signal);

    expect(first).toEqual({ sessionId: 'tester-session-é', failure: null });
    expect(events.map((event) => event.kind)).toEqual(['session', 'log', 'log', 'result']);
    const [cwd, ...args] = (await fake.calls())[0]!;
    expect(cwd).toBe(`cwd=${await fs.realpath(path.join(workspace().home, 'workspaces', project.repoId))}`);
    expect(args.slice(0, 2)).toEqual(['-p', expect.stringContaining('New approved behaviors need tests: B10 v2.')]);
    expect(args).not.toContain('--resume');

    await runTesterJob(project, LAUNCHER, [{ id: 'B10', version: 2 }], first.sessionId, () => undefined, new AbortController().signal);
    expect((await fake.calls())[1]!.slice(-2)).toEqual(['--resume', 'tester-session-é']);
    vi.unstubAllEnvs();
  });

  it('reports a failed job with its exit code and last error line', async () => {
    const { project } = await setUp(3);
    expect((await runTesterJob(project, LAUNCHER, [{ id: 'B2', version: 1 }], null, () => undefined, new AbortController().signal)).failure).toBe('Tester job stopped (exit code 3): rate limited');
    vi.unstubAllEnvs();
  });

  it('reports a missing claude binary as a failure instead of crashing', async () => {
    const project = await createTempProject(workspace());
    await fs.writeFile(path.join(project.repoRoot, 'package.json'), '{ "devDependencies": { "vitest": "^5.0.3" } }');
    const outcome = await runTesterJob(project, LAUNCHER, [{ id: 'B2', version: 1 }], 'kept', () => undefined, new AbortController().signal);
    expect(outcome.sessionId).toBe('kept');
    expect(outcome.failure).toMatch(/^Tester job stopped \(exit code none\): .*ENOENT/u);
  });
});
