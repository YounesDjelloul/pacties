import path from 'node:path';
import { Command, CommanderError, Option } from 'commander';
import { approveCommand } from '@/cli/commands/approve';
import { initCommand } from '@/cli/commands/init';
import { listCommand } from '@/cli/commands/list';
import { rejectCommand } from '@/cli/commands/reject';
import { showCommand } from '@/cli/commands/show';
import { ROLES } from '@/domain/ledger/constants';
import { AppError } from '@/lib/errors';
import { PACTIES_VERSION } from '@/lib/config';
import { startMcpServer } from '@/mcp/server';
import type { CliIo } from '@/cli/cli-io';
import type { Role } from '@/domain/ledger/types';

const EXIT_FAILURE = 1;
const EXIT_UNEXPECTED = 2;

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  try {
    await buildProgram(io).parseAsync(argv, { from: 'user' });
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}

function buildProgram(io: CliIo): Command {
  const program = new Command('pacties')
    .description('Coordinate coding agents on one repo through a shared behavior ledger')
    .version(PACTIES_VERSION)
    .exitOverride()
    .configureOutput({ writeOut: (text) => io.out(text.trimEnd()), writeErr: (text) => io.err(text.trimEnd()) });

  const repoOption = () => new Option('--repo <path>', 'repository to work on').default(io.cwd, 'current directory');
  const repoPath = (options: { repo: string }) => path.resolve(io.cwd, options.repo);

  program
    .command('mcp')
    .description('run the pacties MCP server over stdio for one role')
    .addOption(new Option('--role <role>', 'which agent this server serves').choices(ROLES).makeOptionMandatory())
    .addOption(repoOption())
    .action((options: { role: Role; repo: string }) => startMcpServer(options.role, repoPath(options)));

  program
    .command('list')
    .description('list behaviors and their status')
    .option('--status <statuses>', 'comma-separated statuses to show, e.g. planned,stale')
    .option('--all', 'include rejected behaviors')
    .option('--json', 'print JSON')
    .addOption(repoOption())
    .action((options: { status?: string; all?: boolean; json?: boolean; repo: string }) => listCommand(io, options, repoPath(options)));

  program
    .command('show')
    .description('show one behavior in full')
    .argument('<id>', 'behavior id, e.g. B7')
    .option('--json', 'print JSON')
    .addOption(repoOption())
    .action((id: string, options: { json?: boolean; repo: string }) => showCommand(io, id, options.json === true, repoPath(options)));

  program
    .command('approve')
    .description('review and approve behaviors or pending revisions (developer only, interactive)')
    .argument('[ids...]', 'behavior ids, e.g. B3 B7; omit to pick from everything awaiting approval')
    .addOption(repoOption())
    .action((ids: string[], options: { repo: string }) => approveCommand(io, ids, repoPath(options)));

  program
    .command('reject')
    .description('reject a proposal or a pending revision (developer only, interactive)')
    .argument('<id>', 'behavior id, e.g. B3')
    .requiredOption('--reason <text>', 'why, shown to the planner')
    .addOption(repoOption())
    .action((id: string, options: { reason: string; repo: string }) => rejectCommand(io, id, options.reason, repoPath(options)));

  program
    .command('init')
    .description('register the pacties MCP servers with your coding agents')
    .option('--clients <ids>', 'comma-separated clients, e.g. claude-code,cursor')
    .option('--print', 'print the server config to add by hand instead')
    .addOption(repoOption())
    .action((options: { clients?: string; print?: boolean; repo: string }) => initCommand(io, options, repoPath(options)));

  return program;
}

function reportError(io: CliIo, error: unknown): number {
  if (error instanceof CommanderError) {
    return error.exitCode;
  }
  if (error instanceof AppError) {
    io.err(`pacties: ${error.message}`);
    return EXIT_FAILURE;
  }
  io.err(`pacties: unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  return EXIT_UNEXPECTED;
}
