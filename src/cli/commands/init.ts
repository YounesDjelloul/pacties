import { parseClientIds } from '@/domain/clients/parse-client-ids';
import { InternalError, ValidationError } from '@/lib/errors';
import { detectClients, initClients, manualServerConfig } from '@/shell/clients/init-clients';
import type { ClientId } from '@/domain/clients/types';
import type { CliIo } from '@/cli/cli-io';

export type InitOptions = {
  clients?: string;
  print?: boolean;
};

export async function initCommand(io: CliIo, options: InitOptions, repoPath: string): Promise<void> {
  if (options.print === true) {
    io.out(
      [
        'Add these stdio servers to your MCP client (the same shape works for most clients):',
        '',
        JSON.stringify(await manualServerConfig(repoPath), null, 2),
      ].join('\n'),
    );
    return;
  }

  const clientIds = await chooseClients(io, options);
  const outcome = await initClients(repoPath, clientIds, io.now());

  io.out(`pacties project: ${outcome.project.name} (${outcome.project.repoId})`);
  for (const registration of outcome.registrations) {
    io.out(`${registration.ok ? '✓' : '✗'} ${registration.displayName}: ${registration.detail}`);
  }
  io.out(
    [
      '',
      'Next: restart your agent sessions, then tell one "you are the planner" (pacties-planner tools)',
      'and the other "you are the tester" (pacties-tester tools). Approve behaviors with "pacties approve <id>".',
    ].join('\n'),
  );

  const failed = outcome.registrations.filter((registration) => !registration.ok);
  if (failed.length > 0) {
    throw new InternalError(`${failed.length} of ${outcome.registrations.length} clients could not be registered`);
  }
}

async function chooseClients(io: CliIo, options: InitOptions): Promise<ClientId[]> {
  if (options.clients !== undefined) {
    const parsed = parseClientIds(options.clients);
    if (!parsed.ok) {
      throw new ValidationError(parsed.error);
    }
    return parsed.value;
  }

  const detected = await detectClients();
  if (!io.isInteractive) {
    const found = detected.filter((client) => client.detected).map((client) => client.id);
    if (found.length === 0) {
      throw new ValidationError('No supported MCP client was detected; pass --clients or use --print to register pacties by hand');
    }
    return found;
  }

  const chosen = await io.chooseMany(
    'Register pacties with which clients?',
    detected.map((client) => ({ value: client.id, label: `${client.displayName}${client.detected ? '' : ' (not detected)'}`, checked: client.detected })),
  );
  const parsed = parseClientIds(chosen.join(','));
  if (!parsed.ok) {
    throw new ValidationError('Nothing selected; pacties was not registered anywhere');
  }
  return parsed.value;
}
