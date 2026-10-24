import { SERVER_NAME_PREFIX } from '@/domain/clients/constants';
import { toStdioEntry } from '@/domain/clients/server-specs';
import { shellCommand } from '@/domain/clients/shell-command';
import type { GuardDecision, TesterSessionFiles, TesterSessionInput } from '@/domain/clients/types';

export const TESTER_SERVER_NAME = `${SERVER_NAME_PREFIX}tester`;

const TESTER_SYSTEM_PROMPT = [
  'You are the pacties tester.',
  'Your working directory is a sandbox holding only tests, conventions and config; the implementation lives elsewhere and is deliberately unreadable.',
  'Use the pacties-tester tools: get_delta, list_behaviors, get_behavior, submit_tests, run_tests and report_contract_issue.',
].join(' ');

export function guardedPaths(input: TesterSessionInput): string[] {
  const paths = [input.repoRoot, ...input.worktrees, ...input.privatePaths].map(stripTrailingSlashes).filter((path) => path.length > 1);
  return [...new Set(paths)].sort();
}

export function buildTesterSessionFiles(input: TesterSessionInput): TesterSessionFiles {
  const guarded = guardedPaths(input);
  const deny = guarded.flatMap((path) => ['Read', 'Edit'].flatMap((tool) => [`${tool}(/${path})`, `${tool}(/${path}/**)`]));
  return {
    settings: {
      permissions: { deny, disableBypassPermissionsMode: 'disable' },
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        filesystem: { denyRead: guarded },
      },
      hooks: {
        PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: shellCommand(input.launcher, ['hook', 'tester-guard', input.guardFile]) }] }],
      },
    },
    mcpConfig: {
      mcpServers: {
        [TESTER_SERVER_NAME]: toStdioEntry({
          name: TESTER_SERVER_NAME,
          command: input.launcher.command,
          args: [...input.launcher.args, 'mcp', '--role', 'tester', '--repo', input.repoRoot],
        }),
      },
    },
    guard: { guarded },
  };
}

export function buildTesterClaudeArgs(settingsFile: string, mcpConfigFile: string): string[] {
  return ['--settings', settingsFile, '--strict-mcp-config', '--mcp-config', mcpConfigFile, '--append-system-prompt', TESTER_SYSTEM_PROMPT];
}

export function buildTesterJobArgs(settingsFile: string, mcpConfigFile: string, prompt: string, sessionId: string | null): string[] {
  return [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    ...buildTesterClaudeArgs(settingsFile, mcpConfigFile),
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    `mcp__${TESTER_SERVER_NAME}`,
    ...(sessionId === null ? [] : ['--resume', sessionId]),
  ];
}

export function decideGuard(toolInput: unknown, guarded: string[]): GuardDecision {
  const texts = collectStrings(toolInput).map(comparable);
  const hit = guarded.find((path) => texts.some((text) => text.includes(comparable(path))));
  if (hit === undefined) {
    return { blocked: false, reason: null };
  }
  return {
    blocked: true,
    reason: 'pacties: the tester cannot touch the implementation repository or pacties state. Work only with files in your sandbox and the pacties-tester tools.',
  };
}

export function findUnsafeUserSettings(userSettings: unknown): string[] {
  const sandbox = recordAt(recordAt(userSettings, 'sandbox'), 'excludedCommands');
  const excluded = Array.isArray(sandbox) ? sandbox : [];
  return excluded.length === 0 ? [] : [`sandbox.excludedCommands (${excluded.map(String).join(', ')}) would run outside the sandbox`];
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function recordAt(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

function comparable(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

function stripTrailingSlashes(path: string): string {
  return path.replace(/\/+$/u, '');
}

