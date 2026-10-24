import { checkTesterToolUse } from '@/shell/clients/launch-tester';
import { recordPlannerActivity } from '@/shell/wrapper/planner-activity';
import type { CliIo } from '@/cli/cli-io';

const EXIT_BLOCK = 2;

export async function testerGuardCommand(io: CliIo, guardFile: string): Promise<number> {
  try {
    const decision = await checkTesterToolUse(guardFile, JSON.parse(await io.readStdin()) as unknown);
    if (!decision.blocked) {
      return 0;
    }
    io.err(decision.reason ?? 'pacties: blocked');
    return EXIT_BLOCK;
  } catch {
    io.err('pacties: the tester guard could not read this tool call, so it was blocked');
    return EXIT_BLOCK;
  }
}

export async function plannerStateCommand(io: CliIo, reportFile: string, activity: string): Promise<number> {
  const hookInput = await io.readStdin().then(parseJson, () => null);
  await recordPlannerActivity(reportFile, activity, hookInput).catch(() => undefined);
  return 0;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
