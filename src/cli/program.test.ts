import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '@/cli/program';
import { getBehavior } from '@/shell/ledger/read-behaviors';
import { proposeBehavior } from '@/shell/ledger/propose-behavior';
import { approveBehaviors } from '@/shell/ledger/approve-behaviors';
import { updateBehavior } from '@/shell/ledger/update-behavior';
import { refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import { fakeCliIo } from '@/test-support/fake-cli-io';
import type { Choice } from '@/cli/cli-io';
import { createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';

const T = new Date('2026-10-25T00:00:00.000Z');

describe('pacties CLI', () => {
  const workspace = useTempWorkspace();
  const repoOf = () => path.join(workspace().root, 'Zahlungs Dienst é');

  describe('approve', () => {
    it('refuses to run outside an interactive terminal and approves nothing', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      const io = fakeCliIo(repoOf(), { interactive: false, answer: true });

      expect(await runCli(['approve', 'B1'], io)).toBe(1);
      expect(io.errors()).toContain('only runs in an interactive terminal');
      expect((await getBehavior(project, 'B1')).status).toBe('planned');
    });

    it('shows the proposal and approves nothing when the developer declines', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: false });

      expect(await runCli(['approve', 'b1'], io)).toBe(0);
      expect(io.output()).toContain('B1 v1 (new)  transfer over daily limit returns 429');
      expect(io.output()).toContain('    get_daily_total(user_id) -> int');
      expect(io.prompts).toEqual(['Approve B1 v1?']);
      expect((await getBehavior(project, 'B1')).status).toBe('planned');
    });

    it('approves exactly the versions shown when the developer confirms', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      await proposeBehavior(project, refundOutsideWindow, T);
      await updateBehavior(project, { id: 'B2', description: 'refund 31 days after purchase is refused', reason: 'clearer' }, T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: true });

      expect(await runCli(['approve', 'B2', 'B1'], io)).toBe(0);
      expect(io.prompts).toEqual(['Approve B2 v2, B1 v1?']);
      expect(io.output()).toContain('Approved B2 v2, B1 v1.');
      expect((await getBehavior(project, 'B2')).status).toBe('approved');
    });

    it('shows a pending revision as a diff against the approved version', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T);
      await updateBehavior(project, { id: 'B1', contract: { dependsOn: ['get_daily_total(user_id, day: LocalDate) -> Decimal'] }, reason: 'per calendar day' }, T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: false });

      await runCli(['approve', 'B1'], io);
      expect(io.output()).toContain('B1 v1 -> v2  transfer over daily limit returns 429');
      expect(io.output()).toContain('  reason: per calendar day');
      expect(io.output()).toContain('  - depends on: get_daily_total(user_id) -> int');
      expect(io.output()).toContain('  + depends on: get_daily_total(user_id, day: LocalDate) -> Decimal');
    });

    it('reports a behavior with nothing awaiting approval', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: true });

      expect(await runCli(['approve', 'B1'], io)).toBe(1);
      expect(io.errors()).toBe('pacties: B1 has nothing awaiting approval');
    });

    it('without ids, offers everything awaiting approval and approves only what stays ticked', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      await proposeBehavior(project, refundOutsideWindow, T);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T);
      await updateBehavior(project, { id: 'B1', contract: { dependsOn: [] }, reason: 'stateless' }, T);
      const offered: Choice[] = [];
      const io = fakeCliIo(repoOf(), {
        interactive: true,
        answer: true,
        choose: (choices) => {
          offered.push(...choices);
          return ['B2'];
        },
      });

      expect(await runCli(['approve'], io)).toBe(0);
      expect(offered).toEqual([
        { value: 'B1', label: 'B1 v1 -> v2  revision  transfer over daily limit returns 429  (reason: stateless)', checked: true },
        { value: 'B2', label: 'B2 v1  new       refund requested 31 days after purchase is refused', checked: true },
      ]);
      expect(io.prompts).toEqual(['Approve which behaviors?', 'Approve B2 v1?']);
      expect((await getBehavior(project, 'B2')).status).toBe('approved');
      expect((await getBehavior(project, 'B1')).pendingRevision?.version).toBe(2);
    });

    it('without ids, approves nothing when every behavior is unticked', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: true, choose: () => [] });

      expect(await runCli(['approve'], io)).toBe(0);
      expect(io.output()).toBe('Nothing selected; nothing approved.');
      expect(io.prompts).toEqual(['Approve which behaviors?']);
      expect((await getBehavior(project, 'B1')).status).toBe('planned');
    });

    it('without ids, says so when nothing awaits approval', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: true });

      expect(await runCli(['approve'], io)).toBe(0);
      expect(io.output()).toBe('Nothing is awaiting approval.');
      expect(io.prompts).toEqual([]);
    });

    it('without ids, still refuses to run outside an interactive terminal', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      const io = fakeCliIo(repoOf(), { interactive: false, answer: true });

      expect(await runCli(['approve'], io)).toBe(1);
      expect((await getBehavior(project, 'B1')).status).toBe('planned');
    });
  });

  describe('reject', () => {
    it('rejects a proposal with the given reason after confirmation', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, refundOutsideWindow, T);
      const io = fakeCliIo(repoOf(), { interactive: true, answer: true });

      expect(await runCli(['reject', 'B1', '--reason', 'billing owns refunds'], io)).toBe(0);
      expect(io.prompts).toEqual(['Reject B1?']);
      expect((await getBehavior(project, 'B1')).status).toBe('rejected');
    });

    it('refuses to run outside an interactive terminal', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, refundOutsideWindow, T);
      const io = fakeCliIo(repoOf(), { interactive: false, answer: true });
      expect(await runCli(['reject', 'B1', '--reason', 'x'], io)).toBe(1);
    });
  });

  describe('list and show', () => {
    it('lists behaviors with a summary line', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      await proposeBehavior(project, refundOutsideWindow, T);
      await approveBehaviors(project, [{ id: 'B2', version: 1 }], T);
      const io = fakeCliIo(repoOf(), { interactive: false });

      expect(await runCli(['list'], io)).toBe(0);
      expect(io.output()).toContain('2 behaviors | 1 planned | 1 approved | 0 tested | 0 passing');
      expect(io.output()).toMatch(/B2\s+approved\s+v1\s+refund requested 31 days after purchase is refused/u);
    });

    it('rejects an unknown status filter with the valid ones', async () => {
      await createTempProject(workspace());
      const io = fakeCliIo(repoOf(), { interactive: false });
      expect(await runCli(['list', '--status', 'planned, done'], io)).toBe(1);
      expect(io.errors()).toBe('pacties: Unknown status "done"; use one of planned, approved, tested, passing, stale, rejected');
    });

    it('prints JSON for show --json', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T);
      const io = fakeCliIo(repoOf(), { interactive: false });
      await runCli(['show', 'B1', '--json'], io);
      expect(JSON.parse(io.output())).toMatchObject({ id: 'B1', status: 'planned', version: 1 });
    });

    it('reports an unknown behavior', async () => {
      await createTempProject(workspace());
      const io = fakeCliIo(repoOf(), { interactive: false });
      expect(await runCli(['show', 'B12'], io)).toBe(1);
      expect(io.errors()).toBe('pacties: B12 does not exist');
    });
  });

  describe('init', () => {
    it('names unsupported clients and points to --print', async () => {
      await createTempProject(workspace());
      const io = fakeCliIo(repoOf(), { interactive: false });
      expect(await runCli(['init', '--clients', 'cursor,codex'], io)).toBe(1);
      expect(io.errors()).toContain('pacties does not support "codex" yet');
      expect(io.errors()).toContain('pacties init --print');
    });

    it('registers nothing when the developer unticks every client', async () => {
      await createTempProject(workspace());
      const io = fakeCliIo(repoOf(), { interactive: true, choose: () => [] });
      expect(await runCli(['init'], io)).toBe(1);
      expect(io.prompts).toEqual(['Register pacties with which clients?']);
      expect(io.errors()).toBe('pacties: Nothing selected; pacties was not registered anywhere');
    });
  });

  it('fails when mcp is started without a role', async () => {
    const io = fakeCliIo(workspace().root, { interactive: false });
    expect(await runCli(['mcp'], io)).not.toBe(0);
    expect(io.errors()).toContain("required option '--role <role>' not specified");
  });
});
