import { ValidationError } from '@/lib/errors';
import type { CliIo } from '@/cli/cli-io';

export function requireDeveloperTerminal(io: CliIo, command: string): void {
  if (!io.isInteractive) {
    throw new ValidationError(
      `"pacties ${command}" is the developer's decision and only runs in an interactive terminal; coding agents must ask the developer to run it`,
    );
  }
}
