import { launchTester } from '@/shell/clients/launch-tester';
import type { CliIo } from '@/cli/cli-io';

export async function testerCommand(io: CliIo, repoPath: string): Promise<number> {
  io.out('Preparing the tester sandbox…');
  const launch = await launchTester(repoPath, io.selfLauncher, io.now());
  const { pulled, pushed, conflicts } = launch.sync;
  io.out(`Tester session for ${launch.project.name} ended. Synced at start: ${pulled.length} pulled, ${pushed.length} pushed, ${conflicts.length} conflicts.`);
  return launch.exitCode;
}
