import { parseClientIds } from '@/domain/clients/parse-client-ids';
import { InternalError, ValidationError } from '@/lib/errors';
import { CLIENT_IDS } from '@/domain/clients/constants';
import { detectClients, initClients, manualServerConfig, removeClients } from '@/shell/clients/init-clients';
import type { InitOutcome } from '@/shell/clients/init-clients';
import type { ClientId } from '@/domain/clients/types';
import type { CliIo } from '@/cli/cli-io';

export type InitOptions = {
  clients?: string;
  print?: boolean;
  remove?: boolean;
};

export async function initCommand(io: CliIo, options: InitOptions, repoPath: string): Promise<void> {
  if (options.print === true) {
    io.out(
      [
        'Add this stdio server to your planner\'s MCP client (the same shape works for most clients); the tester runs through "pacties tester":',
        '',
        JSON.stringify(await manualServerConfig(repoPath), null, 2),
      ].join('\n'),
    );
    return;
  }

  if (options.remove === true) {
    const outcome = await removeClients(repoPath, options.clients === undefined ? [...CLIENT_IDS] : parseClients(options.clients), io.now());
    report(io, outcome);
    io.out('\npacties is no longer registered; agent sessions in this repo are back to normal after a restart.');
    failIfAnyFailed(outcome, 'could not be cleaned up');
    return;
  }

  const clientIds = await chooseClients(io, options);
  const outcome = await initClients(repoPath, clientIds, io.now());

  report(io, outcome);
  io.out(
    [
      '',
      'Next: restart your planner session (Claude Code or Cursor) so it picks up the pacties-planner tools.',
      'Open the sandboxed tester with "pacties tester" in another terminal, and approve behaviors with "pacties approve".',
    ].join('\n'),
  );

  failIfAnyFailed(outcome, 'could not be registered');
}

function report(io: CliIo, outcome: InitOutcome): void {
  io.out(`pacties project: ${outcome.project.name} (${outcome.project.repoId})`);
  for (const registration of outcome.registrations) {
    io.out(`${registration.ok ? '✓' : '✗'} ${registration.displayName}: ${registration.detail}`);
  }
}

function failIfAnyFailed(outcome: InitOutcome, problem: string): void {
  const failed = outcome.registrations.filter((registration) => !registration.ok);
  if (failed.length > 0) {
    throw new InternalError(`${failed.length} of ${outcome.registrations.length} clients ${problem}`);
  }
}

function parseClients(raw: string): ClientId[] {
  const parsed = parseClientIds(raw);
  if (!parsed.ok) {
    throw new ValidationError(parsed.error);
  }
  return parsed.value;
}

async function chooseClients(io: CliIo, options: InitOptions): Promise<ClientId[]> {
  if (options.clients !== undefined) {
    return parseClients(options.clients);
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
