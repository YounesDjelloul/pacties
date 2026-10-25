import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PLANNER_NUDGE } from '@/domain/wrapper/wrapper-state';
import { proposeBehavior } from '@/shell/ledger/propose-behavior';
import { getBehavior } from '@/shell/ledger/read-behaviors';
import { reportContractIssue } from '@/shell/testing/report-contract-issue';
import { recordPlannerActivity } from '@/shell/wrapper/planner-activity';
import { runWrapper } from '@/shell/wrapper/run-wrapper';
import { refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import { createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';
import xtermHeadless from '@xterm/headless';
import type { WrapperTerminal } from '@/shell/wrapper/types';

const NOW = new Date('2026-10-25T00:59:59.999Z');
const LAUNCHER = { command: '/opt/node 26/bin/node', args: ['/opt/pacties é/dist/cli/index.js'] };
const WAIT = { timeout: 8_000, interval: 50 };

type FakeTerminal = WrapperTerminal & { type: (text: string) => void; screen: () => string; resizeTo: (columns: number, rows: number) => void };

function fakeTerminal(columns: number, rows: number): FakeTerminal {
  let size = { columns, rows };
  let output = '';
  const inputs: Array<(chunk: string) => void> = [];
  const resizes: Array<() => void> = [];
  return {
    columns: () => size.columns,
    rows: () => size.rows,
    write: (text) => {
      output += text;
    },
    onInput: (listener) => inputs.push(listener),
    onResize: (listener) => resizes.push(listener),
    start: () => undefined,
    stop: () => undefined,
    type: (text) => inputs.forEach((listener) => listener(text)),
    screen: () => output,
    resizeTo: (nextColumns, nextRows) => {
      size = { columns: nextColumns, rows: nextRows };
      resizes.forEach((listener) => listener());
    },
  };
}

async function installFakeClaude(root: string): Promise<{ bin: string; plannerLog: string; jobLog: string }> {
  const bin = path.join(root, 'fake bin', 'claude');
  const plannerLog = path.join(root, 'planner input.log');
  const jobLog = path.join(root, 'tester jobs.log');
  await fs.mkdir(path.dirname(bin), { recursive: true });
  await fs.writeFile(
    bin,
    [
      '#!/bin/sh',
      'if [ "$1" = "-p" ]; then',
      `  printf '%s\\n' "$*" >> "${jobLog}"`,
      `  echo '{"type":"system","subtype":"init","session_id":"tester-7"}'`,
      `  printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"Blocked on B2 v1: the contract for transfer limits per Zoë says POST /transfer returns { remaining } but never gives remaining a type, so I cannot assert it.\\r\\nNext: report_contract_issue B2 and cover B1 meanwhile."}]}}'`,
      `  echo '{"type":"result","subtype":"success","is_error":false,"result":"Covered B1 and B2.","session_id":"tester-7"}'`,
      '  exit 0',
      'fi',
      `printf 'planner args: %s\\n' "$*" >> "${plannerLog}"`,
      'echo "planner ready in $(pwd -P)"',
      'while IFS= read -r line; do',
      `  printf '%s\\n' "$line" >> "${plannerLog}"`,
      '  echo "planner got: $line"',
      'done',
    ].join('\n'),
    { mode: 0o755 },
  );
  return { bin, plannerLog, jobLog };
}

const readOr = (file: string) => fs.readFile(file, 'utf8').catch(() => '');

describe('runWrapper', () => {
  const workspace = useTempWorkspace();

  it('runs the planner, approves from the pacties screen, starts a tester job, nudges the idle planner, and quits', async () => {
    const project = await createTempProject(workspace());
    await fs.writeFile(path.join(project.repoRoot, 'package.json'), '{ "devDependencies": { "vitest": "^5.0.3" } }');
    await proposeBehavior(project, transferOverDailyLimit, NOW);
    await proposeBehavior(project, refundOutsideWindow, NOW);
    const fake = await installFakeClaude(workspace().root);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    const terminal = fakeTerminal(110, 30);

    const exit = runWrapper(project, LAUNCHER, terminal, () => NOW, { kind: 'new', sessionId: 'planner-new-1' });

    await vi.waitFor(() => expect(terminal.screen()).toContain('planner ready in'), WAIT);
    await vi.waitFor(() => expect(terminal.screen()).toContain('pacties · 2 to approve · tester idle'), WAIT);

    await vi.waitFor(async () => expect(await readOr(fake.plannerLog)).toContain('planner args: --session-id planner-new-1 --settings'), WAIT);
    terminal.type('transfer limits per Zoë\r');
    await vi.waitFor(async () => expect(await readOr(fake.plannerLog)).toContain('transfer limits per Zoë'), WAIT);

    terminal.type('\u001c');
    await vi.waitFor(() => expect(terminal.screen()).toContain('Awaiting approval'), WAIT);
    terminal.type('a');
    await vi.waitFor(async () => expect((await getBehavior(project, 'B2')).status).toBe('approved'), WAIT);
    await vi.waitFor(async () => expect(await readOr(fake.jobLog)).toContain('New approved behaviors need tests: B1 v1, B2 v1.'), WAIT);
    await vi.waitFor(() => expect(terminal.screen()).toContain('✓ Tester job finished'), WAIT);
    expect(terminal.screen()).toContain('  · Blocked on B2 v1: the contract for transfer limits per Zoë says POST /transfer returns { remaining } but');
    expect(terminal.screen()).toContain('    never gives remaining a type, so I cannot assert it.');
    expect(terminal.screen()).toContain('    Next: report_contract_issue B2 and cover B1 meanwhile.');
    expect((await readOr(fake.plannerLog)).split('\n').slice(1)).toEqual(['transfer limits per Zoë', '']);
    expect(await readOr(fake.jobLog)).not.toContain('--resume');
    await vi.waitFor(async () => expect(JSON.parse(await readOr(path.join(project.dir, 'session-pairs.json')))).toEqual({ 'planner-new-1': 'tester-7' }), WAIT);

    await reportContractIssue(project, { id: 'B1', version: 1, problem: 'remaining has no type' }, NOW);
    await recordPlannerActivity(path.join(project.dir, 'planner-session', 'report.json'), 'idle', { session_id: 'planner-new-1' });
    await vi.waitFor(async () => expect(await readOr(fake.plannerLog)).toContain(PLANNER_NUDGE), WAIT);

    terminal.resizeTo(60, 12);
    await vi.waitFor(() => expect(terminal.screen()).toContain('[12;1H'), WAIT);

    terminal.type('qq');
    expect(await exit).toBe(0);
    expect(terminal.screen().endsWith('\u001b[?2004l\u001b[?25h\u001b[?1049l\u001b]2;\u0007')).toBe(true);
    vi.unstubAllEnvs();
  }, 30_000);

  it('ends with the planner exit code when the planner exits on its own', async () => {
    const project = await createTempProject(workspace());
    const bin = path.join(workspace().root, 'fake bin', 'claude');
    await fs.mkdir(path.dirname(bin), { recursive: true });
    await fs.writeFile(bin, '#!/bin/sh\necho bye\nexit 4\n', { mode: 0o755 });
    vi.stubEnv('PACTIES_CLAUDE_BIN', bin);
    expect(await runWrapper(project, LAUNCHER, fakeTerminal(80, 24), () => NOW, { kind: 'new', sessionId: 'n' })).toBe(4);
    vi.unstubAllEnvs();
  }, 15_000);

  it('waits for the picked planner session, then resumes the tester paired with it', async () => {
    const project = await createTempProject(workspace());
    await fs.writeFile(path.join(project.repoRoot, 'package.json'), '{ "devDependencies": { "vitest": "^5.0.3" } }');
    await fs.writeFile(path.join(project.dir, 'session-pairs.json'), JSON.stringify({ 'picked-planner': 'tester-old-é', other: 'tester-x' }));
    await proposeBehavior(project, transferOverDailyLimit, NOW);
    const fake = await installFakeClaude(workspace().root);
    vi.stubEnv('PACTIES_CLAUDE_BIN', fake.bin);
    const terminal = fakeTerminal(110, 30);

    const exit = runWrapper(project, LAUNCHER, terminal, () => NOW, { kind: 'pick' });
    await vi.waitFor(() => expect(terminal.screen()).toContain('tester waiting for planner session'), WAIT);
    await vi.waitFor(async () => expect(await readOr(fake.plannerLog)).toContain('planner args: --resume --settings'), WAIT);

    terminal.type('\u001ca');
    await vi.waitFor(async () => expect((await getBehavior(project, 'B1')).status).toBe('approved'), WAIT);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await readOr(fake.jobLog)).toBe('');

    await recordPlannerActivity(path.join(project.dir, 'planner-session', 'report.json'), 'busy', { session_id: 'picked-planner' });
    await vi.waitFor(async () => expect(await readOr(fake.jobLog)).toContain('--resume tester-old-é'), WAIT);

    terminal.type('qq');
    expect(await exit).toBe(0);
    vi.unstubAllEnvs();
  }, 30_000);

  it('shows the planner exactly as it would look without pacties, even when colour codes arrive split, and replays output made while hidden', async () => {
    const project = await createTempProject(workspace());
    const script = path.join(workspace().root, 'fake bin', 'claude');
    await fs.mkdir(path.dirname(script), { recursive: true });
    await fs.writeFile(
      script,
      [
        '#!/bin/sh',
        "printf 'Résumé of Zoë\\r\\n\\033[3'",
        'sleep 0.2',
        "printf '8;5;12mblue text\\033[0m and \\033[1;31mbold red\\033[0m\\r\\n'",
        "printf 'line to erase\\r\\n\\033[1A\\033[2K\\033[32mreplaced\\033[0m 漢字 ✓\\r\\n'",
        'sleep 0.6',
        "printf '\\033[44mwritten while hidden\\033[0m\\r\\n'",
        'sleep 30',
      ].join('\n'),
      { mode: 0o755 },
    );
    vi.stubEnv('PACTIES_CLAUDE_BIN', script);
    const terminal = fakeTerminal(60, 12);

    const exit = runWrapper(project, LAUNCHER, terminal, () => NOW, { kind: 'new', sessionId: 'n' });
    await vi.waitFor(() => expect(terminal.screen()).toContain('replaced'), WAIT);
    terminal.type('\u001c');
    await vi.waitFor(() => expect(terminal.screen()).toContain('Nothing awaiting approval.'), WAIT);
    await new Promise((resolve) => setTimeout(resolve, 900));
    terminal.type('\u001c');
    await vi.waitFor(() => expect(terminal.screen()).toContain('written while hidden'), WAIT);

    const direct = [
      'Résumé of Zoë\r\n\u001b[38;5;12mblue text\u001b[0m and \u001b[1;31mbold red\u001b[0m\r\n',
      'line to erase\r\n\u001b[1A\u001b[2K\u001b[32mreplaced\u001b[0m 漢字 ✓\r\n',
      '\u001b[44mwritten while hidden\u001b[0m\r\n',
    ].join('');
    expect(await screenOf(terminal.screen())).toEqual(await screenOf(direct));

    terminal.type('\u001cqq');
    expect(await exit).toBe(0);
    vi.unstubAllEnvs();
  }, 30_000);

  it('brings back a full-screen planner exactly, input box included, and pauses its mouse tracking while pacties is shown', async () => {
    const project = await createTempProject(workspace());
    const script = path.join(workspace().root, 'fake bin', 'claude');
    await fs.mkdir(path.dirname(script), { recursive: true });
    await fs.writeFile(
      script,
      [
        '#!/bin/sh',
        "printf '\\033[?1049h\\033[2J\\033[H\\033[?1000h\\033[?1003h\\033[?1006h\\033[?25l'",
        "printf '\\033[1;1H\\033[38;5;174m▐▛███▜▌\\033[0m Claude Code\\033[3;1H⏺ Résumé of Zoë refunds'",
        "printf '\\033[10;1H\\033[2m────────────\\033[0m\\033[11;1H> \\033[7m \\033[0m\\033[12;1H\\033[2m? for shortcuts\\033[0m'",
        'sleep 0.6',
        "printf '\\033[5;1H\\033[33m✻ Thinking…\\033[0m'",
        'sleep 30',
      ].join('\n'),
      { mode: 0o755 },
    );
    vi.stubEnv('PACTIES_CLAUDE_BIN', script);
    const terminal = fakeTerminal(60, 12);

    const exit = runWrapper(project, LAUNCHER, terminal, () => NOW, { kind: 'new', sessionId: 'n' });
    await vi.waitFor(() => expect(terminal.screen()).toContain('shortcuts'), WAIT);
    const beforeSwitch = terminal.screen().length;
    terminal.type('\u001c');
    await vi.waitFor(() => expect(terminal.screen()).toContain('Nothing awaiting approval.'), WAIT);
    expect(terminal.screen().slice(beforeSwitch)).toContain('\u001b[?1003l');
    expect(terminal.screen().slice(beforeSwitch)).not.toContain('\u001b[?1049h');
    await new Promise((resolve) => setTimeout(resolve, 900));
    terminal.resizeTo(60, 12);
    const beforeReturn = terminal.screen().length;
    terminal.type('\u001c');
    await vi.waitFor(() => expect(terminal.screen().slice(beforeReturn)).toContain('\u001b[?1003h'), WAIT);

    const direct = [
      '\u001b[?1049h\u001b[2J\u001b[H\u001b[?25l',
      "\u001b[1;1H\u001b[38;5;174m▐▛███▜▌\u001b[0m Claude Code\u001b[3;1H⏺ Résumé of Zoë refunds",
      '\u001b[10;1H\u001b[2m────────────\u001b[0m\u001b[11;1H> \u001b[7m \u001b[0m\u001b[12;1H\u001b[2m? for shortcuts\u001b[0m',
      '\u001b[5;1H\u001b[33m✻ Thinking…\u001b[0m',
    ].join('');
    expect(await screenOf(terminal.screen())).toEqual(await screenOf(direct));

    terminal.type('\u001cqq');
    expect(await exit).toBe(0);
    vi.unstubAllEnvs();
  }, 30_000);
});

async function screenOf(output: string): Promise<string[]> {
  const emulator = new xtermHeadless.Terminal({ cols: 60, rows: 12, allowProposedApi: true });
  await new Promise<void>((resolve) => emulator.write(output, resolve));
  const buffer = emulator.buffer.active;
  const cells: string[] = [];
  for (let row = 0; row < 12; row += 1) {
    const line = buffer.getLine(buffer.viewportY + row);
    let rendered = '';
    for (let column = 0; column < 60; column += 1) {
      const cell = line?.getCell(column);
      if (cell !== undefined && cell.getWidth() > 0) {
        rendered += `${cell.getChars() || ' '}${cell.getFgColor()}/${cell.getBgColor()}/${cell.isBold()}|`;
      }
    }
    cells.push(rendered);
  }
  emulator.dispose();
  return cells;
}
