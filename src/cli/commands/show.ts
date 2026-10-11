import { formatBehaviorDetail } from '@/cli/format';
import { parseId } from '@/cli/parse-ids';
import { getBehavior } from '@/shell/ledger/read-behaviors';
import { resolveProject } from '@/shell/project/resolve-project';
import type { CliIo } from '@/cli/cli-io';

export async function showCommand(io: CliIo, rawId: string, json: boolean, repoPath: string): Promise<void> {
  const id = parseId(rawId);
  const project = await resolveProject(repoPath, io.now());
  const behavior = await getBehavior(project, id);
  io.out(json ? JSON.stringify(behavior, null, 2) : formatBehaviorDetail(behavior));
}
