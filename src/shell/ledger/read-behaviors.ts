import { findBehavior, selectBehaviors } from '@/domain/ledger/behavior-queries';
import { summarizeLedger } from '@/domain/ledger/summarize-ledger';
import { testerView } from '@/domain/ledger/tester-view';
import { buildReview, pendingReviews } from '@/domain/ledger/review';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { loadLedger } from '@/shell/ledger/load-ledger';
import type { Behavior, BehaviorFilter, BehaviorId, LedgerSummary, Review, TesterBehaviorView } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export type BehaviorListing = {
  behaviors: Behavior[];
  summary: LedgerSummary;
};

export async function listBehaviors(project: Project, filter: BehaviorFilter): Promise<BehaviorListing> {
  const { ledger } = await loadLedger(project);
  return { behaviors: selectBehaviors(ledger, filter), summary: summarizeLedger(ledger) };
}

export async function getBehavior(project: Project, id: BehaviorId): Promise<Behavior> {
  const { ledger } = await loadLedger(project);
  const behavior = findBehavior(ledger, id);
  if (behavior === undefined) {
    throw new NotFoundError(`${id} does not exist`);
  }
  return behavior;
}

export async function listApprovedBehaviors(project: Project): Promise<TesterBehaviorView[]> {
  const { ledger } = await loadLedger(project);
  return testerView(ledger);
}

export async function getApprovedBehavior(project: Project, id: BehaviorId): Promise<TesterBehaviorView> {
  const { ledger } = await loadLedger(project);
  const view = testerView(ledger).find((behavior) => behavior.id === id);
  if (view === undefined) {
    throw new NotFoundError(`${id} does not exist`);
  }
  return view;
}

export async function getReviews(project: Project, ids: BehaviorId[]): Promise<Review[]> {
  const { ledger } = await loadLedger(project);
  return ids.map((id) => {
    const behavior = findBehavior(ledger, id);
    if (behavior === undefined) {
      throw new NotFoundError(`${id} does not exist`);
    }
    const review = buildReview(behavior);
    if (review === null) {
      throw new ValidationError(`${id} has nothing awaiting approval`);
    }
    return review;
  });
}

export async function getPendingReviews(project: Project): Promise<Review[]> {
  const { ledger } = await loadLedger(project);
  return pendingReviews(ledger);
}
