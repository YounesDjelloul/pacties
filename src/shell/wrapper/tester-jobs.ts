import { runClaudeJob } from '@/data/claude-job';
import { buildTesterJobArgs } from '@/domain/clients/tester-session';
import { buildTesterJobPrompt, parseStreamLine } from '@/domain/wrapper/tester-job';
import { prepareTesterSession } from '@/shell/clients/launch-tester';
import type { Launcher } from '@/domain/clients/types';
import type { ApprovalRequest } from '@/domain/ledger/types';
import type { Project } from '@/domain/project/types';
import type { StreamEvent } from '@/domain/wrapper/types';

export type TesterJobOutcome = {
  sessionId: string | null;
  failure: string | null;
};

export async function runTesterJob(
  project: Project,
  launcher: Launcher,
  requests: ApprovalRequest[],
  sessionId: string | null,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<TesterJobOutcome> {
  const session = await prepareTesterSession(project, launcher);
  let latestSessionId = sessionId;
  const exit = await runClaudeJob(buildTesterJobArgs(session.settingsFile, session.mcpConfigFile, buildTesterJobPrompt(requests), sessionId), session.workspace, (line) => {
    const event = parseStreamLine(line);
    if (event === null) {
      return;
    }
    const reported = event.kind === 'log' ? null : event.sessionId;
    if (reported !== null) {
      latestSessionId = reported;
    }
    onEvent(event);
  }, signal);

  const failure = exit.exitCode === 0 ? null : `Tester job stopped (exit code ${exit.exitCode ?? 'none'})${exit.stderrTail.length === 0 ? '' : `: ${exit.stderrTail.split('\n').at(-1)}`}`;
  return { sessionId: latestSessionId, failure };
}
