import { checkTesterToolUse } from '@/shell/clients/launch-tester';
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
