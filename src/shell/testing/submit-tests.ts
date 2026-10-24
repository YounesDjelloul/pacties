import { appendEvents } from '@/data/event-log';
import { withLedgerLock } from '@/data/storage-lock';
import { listWorkspaceFiles, readTextFiles } from '@/data/workspace-files';
import { buildTestSubmissionEvents } from '@/domain/ledger/build-events';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import { testerView } from '@/domain/ledger/tester-view';
import { extractTags } from '@/domain/testing/map-results';
import { isTestPath } from '@/domain/testing/test-policy';
import { loadLedger, stampAfter, toAppError, unwrapFold } from '@/shell/ledger/load-ledger';
import { testerWorkspaceDir } from '@/shell/testing/sync-workspace';
import { loadTestPolicy } from '@/shell/testing/test-policy';
import type { ApprovalRequest, TesterBehaviorView } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';

export async function submitTests(project: Project, requests: ApprovalRequest[], now: Date): Promise<TesterBehaviorView[]> {
  const policy = await loadTestPolicy(project);
  const workspace = testerWorkspaceDir(project);
  const testPaths = (await listWorkspaceFiles(workspace)).filter((path) => isTestPath(path, policy));
  const taggedIds = [...new Set((await readTextFiles(workspace, testPaths)).flatMap((file) => extractTags(file.content)))];

  return withLedgerLock(project.dir, async (lock) => {
    const { events, ledger } = await loadLedger(project);
    const submissions = buildTestSubmissionEvents(ledger, { requests, taggedIds }, stampAfter(ledger, now));
    if (!submissions.ok) {
      throw toAppError(submissions.error);
    }
    await appendEvents(project.dir, submissions.value, lock);
    const updated = unwrapFold(foldLedger([...events, ...submissions.value]), project);
    return testerView(updated).filter((view) => requests.some((request) => request.id === view.id));
  });
}
