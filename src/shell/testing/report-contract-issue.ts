import { appendEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { buildContractIssueEvent } from '@/domain/ledger/build-events';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import { testerView } from '@/domain/ledger/tester-view';
import { loadLedger, stampAfter, toAppError, unwrapFold } from '@/shell/ledger/load-ledger';
import type { ContractIssueInput, TesterBehaviorView } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export async function reportContractIssue(project: Project, input: ContractIssueInput, now: Date): Promise<TesterBehaviorView> {
  return withLedgerLock(project.dir, async (lock) => {
    const { events, ledger } = await loadLedger(project);
    const issue = buildContractIssueEvent(ledger, input, stampAfter(ledger, now));
    if (!issue.ok) {
      throw toAppError(issue.error);
    }
    await appendEvents(project.dir, [issue.value], lock);
    const updated = unwrapFold(foldLedger([...events, issue.value]), project);
    return testerView(updated).find((view) => view.id === input.id)!;
  });
}
