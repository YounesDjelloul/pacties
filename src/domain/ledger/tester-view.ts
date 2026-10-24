import type { Ledger, TesterBehaviorView } from '@/domain/ledger/types';

export function testerView(ledger: Ledger): TesterBehaviorView[] {
  return ledger.behaviors
    .filter((behavior) => behavior.approvedAt !== null && behavior.status !== 'rejected')
    .map(({ id, version, status, description, contract, openIssues }) => ({ id, version, status, description, contract, openIssues }));
}
