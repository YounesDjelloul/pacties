import { readCursors, writeCursors } from '@/data/cursors';
import { readEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { computePlannerDelta, computeTesterDelta } from '@/domain/ledger/compute-delta';
import { advanceCursor } from '@/domain/ledger/cursors';
import { InternalError } from '@/lib/errors';
import type { Result } from '@/domain/shared/types';
import type { LedgerEvent, PlannerDelta, Role, TesterDelta } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export type DeltaOptions = {
  peek: boolean;
};

export function getPlannerDelta(project: Project, options: DeltaOptions): Promise<PlannerDelta> {
  return readDelta(project, 'planner', options, computePlannerDelta);
}

export function getTesterDelta(project: Project, options: DeltaOptions): Promise<TesterDelta> {
  return readDelta(project, 'tester', options, computeTesterDelta);
}

async function readDelta<D extends { toSeq: number }>(
  project: Project,
  role: Role,
  options: DeltaOptions,
  compute: (events: LedgerEvent[], cursor: number) => Result<D>,
): Promise<D> {
  if (options.peek) {
    const [events, cursors] = await Promise.all([readEvents(project.dir), readCursors(project.dir)]);
    return unwrapDelta(compute(events, cursors[role]), project);
  }

  return withLedgerLock(project.dir, async (lock) => {
    const [events, cursors] = await Promise.all([readEvents(project.dir), readCursors(project.dir)]);
    const delta = unwrapDelta(compute(events, cursors[role]), project);
    await writeCursors(project.dir, advanceCursor(cursors, role, delta.toSeq), lock);
    return delta;
  });
}

function unwrapDelta<D>(result: Result<D>, project: Project): D {
  if (!result.ok) {
    throw new InternalError(`The ledger of ${project.name} is inconsistent: ${result.error}`);
  }
  return result.value;
}
