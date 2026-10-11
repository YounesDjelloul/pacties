import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { approveBehaviors } from '@/shell/ledger/approve-behaviors';
import { getPlannerDelta, getTesterDelta } from '@/shell/ledger/get-delta';
import { proposeBehavior } from '@/shell/ledger/propose-behavior';
import { getApprovedBehavior, getBehavior, listApprovedBehaviors, listBehaviors } from '@/shell/ledger/read-behaviors';
import { rejectBehavior } from '@/shell/ledger/reject-behavior';
import { updateBehavior } from '@/shell/ledger/update-behavior';
import { resolveProject } from '@/shell/project/resolve-project';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { accentedPayeeName, refundOutsideWindow, transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import { createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';

const T1 = new Date('2026-10-25T00:59:59.999Z');
const T2 = new Date('2026-10-25T01:00:00.001Z');
const T3 = new Date('2026-10-25T02:17:43.508Z');

describe('ledger workflows', () => {
  const workspace = useTempWorkspace();

  describe('proposeBehavior', () => {
    it('persists the proposal so a fresh resolution of the same repo sees it', async () => {
      const project = await createTempProject(workspace());
      const proposed = await proposeBehavior(project, transferOverDailyLimit, T1);

      const reopened = await resolveProject(path.join(workspace().root, 'Zahlungs Dienst é'), T3);
      const listing = await listBehaviors(reopened, {});
      expect(proposed).toMatchObject({ id: 'B1', version: 1, status: 'planned', description: 'transfer over daily limit returns 429' });
      expect(listing.behaviors).toEqual([proposed]);
      expect(listing.summary.planned).toBe(1);
    });

    it('gives distinct consecutive ids to proposals written concurrently and loses no event', async () => {
      const project = await createTempProject(workspace());
      const inputs = Array.from({ length: 12 }, (_, index) => ({
        description: `payout batch ${index + 1} settles at 23:59:59.999 local time`,
        contract: { interface: [`POST /payouts/${index + 1}/settle -> 202`] },
      }));

      const proposed = await Promise.all(inputs.map((input) => proposeBehavior(project, input, T1)));

      expect(proposed.map((behavior) => behavior.id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))).toEqual(
        Array.from({ length: 12 }, (_, index) => `B${index + 1}`),
      );
      const lines = (await fs.readFile(path.join(project.dir, 'events.jsonl'), 'utf8')).trimEnd().split('\n');
      expect(lines.map((line) => JSON.parse(line).seq)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    });

    it('surfaces an invalid proposal as a ValidationError without writing anything', async () => {
      const project = await createTempProject(workspace());
      await expect(proposeBehavior(project, { description: ' \r\n ', contract: { interface: ['GET /x'] } }, T1)).rejects.toBeInstanceOf(ValidationError);
      await expect(fs.readFile(path.join(project.dir, 'events.jsonl'), 'utf8')).rejects.toThrow();
    });
  });

  describe('updateBehavior', () => {
    it('updates a draft in place', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, refundOutsideWindow, T1);
      const outcome = await updateBehavior(project, { id: 'B1', contract: { dependsOn: [] }, reason: 'purchase date is in the request' }, T2);
      expect([outcome.effect, outcome.behavior.version, outcome.behavior.contract.dependsOn]).toEqual(['draft_updated', 2, []]);
    });

    it('stores a revision of an approved behavior as pending', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T2);
      const outcome = await updateBehavior(project, { id: 'B1', description: 'transfer over limit returns 429 with Retry-After', reason: 'retry hint' }, T3);
      expect([outcome.effect, outcome.behavior.version, outcome.behavior.pendingRevision?.version]).toEqual(['revision_pending', 1, 2]);
    });

    it('surfaces an unknown id as a NotFoundError', async () => {
      const project = await createTempProject(workspace());
      await expect(updateBehavior(project, { id: 'B10', description: 'x', reason: 'y' }, T1)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('approveBehaviors', () => {
    it('approves several behaviors in one batch', async () => {
      const project = await createTempProject(workspace());
      for (const input of [transferOverDailyLimit, refundOutsideWindow, accentedPayeeName]) {
        await proposeBehavior(project, input, T1);
      }
      const approved = await approveBehaviors(project, [{ id: 'B3', version: 1 }, { id: 'B1', version: 1 }], T2);
      expect(approved.map(({ id, status, approvedAt }) => ({ id, status, approvedAt }))).toEqual([
        { id: 'B3', status: 'approved', approvedAt: T2.toISOString() },
        { id: 'B1', status: 'approved', approvedAt: T2.toISOString() },
      ]);
    });

    it('surfaces an approval of a version the planner has since revised as a ConflictError', async () => {
      const project = await createTempProject(workspace());
      const reviewed = await proposeBehavior(project, transferOverDailyLimit, T1);
      await updateBehavior(project, { id: 'B1', description: 'transfer over limit returns 429 immediately', reason: 'no queue' }, T2);
      await expect(approveBehaviors(project, [{ id: 'B1', version: reviewed.version }], T3)).rejects.toBeInstanceOf(ConflictError);
      expect((await getBehavior(project, 'B1')).status).toBe('planned');
    });
  });

  describe('rejectBehavior', () => {
    it('rejects a draft and hides it from the default listing', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, refundOutsideWindow, T1);
      const rejected = await rejectBehavior(project, { id: 'B1', reason: 'billing owns refunds' }, T2);
      expect(rejected.status).toBe('rejected');
      expect((await listBehaviors(project, {})).behaviors).toEqual([]);
    });
  });

  describe('reading behaviors', () => {
    it('surfaces an unknown id as a NotFoundError for the planner', async () => {
      const project = await createTempProject(workspace());
      await expect(getBehavior(project, 'B4')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('answers the tester with not found for a draft, exactly as for an unknown id', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      const draft = getApprovedBehavior(project, 'B1');
      const unknown = getApprovedBehavior(project, 'B2');
      await expect(draft).rejects.toThrow(new NotFoundError('B1 does not exist'));
      await expect(unknown).rejects.toThrow(new NotFoundError('B2 does not exist'));
    });

    it('lists only approved behaviors for the tester', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      await proposeBehavior(project, refundOutsideWindow, T1);
      await approveBehaviors(project, [{ id: 'B2', version: 1 }], T2);
      expect((await listApprovedBehaviors(project)).map((view) => view.id)).toEqual(['B2']);
      expect(await getApprovedBehavior(project, 'B2')).not.toHaveProperty('pendingRevision');
    });
  });

  describe('deltas', () => {
    it('advances the tester cursor so the next delta is empty', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T2);

      const first = await getTesterDelta(project, { peek: false });
      const second = await getTesterDelta(project, { peek: false });
      expect([first.fromSeq, first.toSeq, first.changes.map((change) => change.id)]).toEqual([0, 2, ['B1']]);
      expect([second.fromSeq, second.toSeq, second.changes]).toEqual([2, 2, []]);
    });

    it('does not advance the cursor when peeking', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T2);

      await getTesterDelta(project, { peek: true });
      expect((await getTesterDelta(project, { peek: false })).changes).toHaveLength(1);
    });

    it('keeps planner and tester cursors independent', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      await getPlannerDelta(project, { peek: false });
      await approveBehaviors(project, [{ id: 'B1', version: 1 }], T2);

      const planner = await getPlannerDelta(project, { peek: false });
      const tester = await getTesterDelta(project, { peek: false });
      expect([planner.fromSeq, planner.decisions.map((decision) => decision.id)]).toEqual([1, ['B1']]);
      expect([tester.fromSeq, tester.changes.map((change) => change.change)]).toEqual([0, ['added']]);
      expect(JSON.parse(await fs.readFile(path.join(project.dir, 'cursors.json'), 'utf8'))).toEqual({ planner: 2, tester: 2 });
    });
  });

  describe('event log integrity', () => {
    it('ignores a torn final line on read and removes it before the next write', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      const logPath = path.join(project.dir, 'events.jsonl');
      await fs.appendFile(logPath, '{"seq":2,"type":"behavior_appr');

      expect((await listBehaviors(project, {})).behaviors).toHaveLength(1);
      const next = await proposeBehavior(project, refundOutsideWindow, T2);
      expect(next.id).toBe('B2');
      const lines = (await fs.readFile(logPath, 'utf8')).split('\n');
      expect([lines.length, lines.at(-1), JSON.parse(lines[1]!).seq]).toEqual([3, '', 2]);
    });

    it('refuses to read a log with a corrupt line in the middle and names the line', async () => {
      const project = await createTempProject(workspace());
      await proposeBehavior(project, transferOverDailyLimit, T1);
      await proposeBehavior(project, refundOutsideWindow, T2);
      const logPath = path.join(project.dir, 'events.jsonl');
      const [first, second] = (await fs.readFile(logPath, 'utf8')).trimEnd().split('\n');
      await fs.writeFile(logPath, `${first}\n{"seq": 2, "type": "behavior_proposed"}\n${second?.replace('"seq":2', '"seq":3')}\n`);

      await expect(listBehaviors(project, {})).rejects.toThrow(InternalError);
      await expect(listBehaviors(project, {})).rejects.toThrow(/line 2 is corrupt/u);
    });
  });
});
