import { describe, expect, it } from 'vitest';
import { mergeServersIntoMcpConfig } from '@/domain/clients/merge-mcp-config';
import { buildServerSpecs } from '@/domain/clients/server-specs';

const specs = buildServerSpecs({ command: 'pacties', args: [] }, '${workspaceFolder}');

describe('mergeServersIntoMcpConfig', () => {
  it('creates the config from nothing', () => {
    expect(mergeServersIntoMcpConfig(null, specs)).toEqual({
      ok: true,
      value: {
        mcpServers: {
          'pacties-planner': { type: 'stdio', command: 'pacties', args: ['mcp', '--role', 'planner', '--repo', '${workspaceFolder}'] },
          'pacties-tester': { type: 'stdio', command: 'pacties', args: ['mcp', '--role', 'tester', '--repo', '${workspaceFolder}'] },
        },
      },
    });
  });

  it('keeps the user\'s other servers and top-level keys untouched', () => {
    const existing = {
      theme: 'dark',
      mcpServers: {
        'github': { command: 'docker', args: ['run', '-i', 'ghcr.io/github/github-mcp-server'], env: { GITHUB_TOKEN: '${env:GH}' } },
        'pacties': { command: 'not-ours' },
      },
    };
    const merged = mergeServersIntoMcpConfig(existing, specs);
    expect(merged.ok && merged.value.theme).toBe('dark');
    expect(merged.ok && Object.keys(merged.value.mcpServers as object)).toEqual(['github', 'pacties', 'pacties-planner', 'pacties-tester']);
    expect(merged.ok && (merged.value.mcpServers as Record<string, unknown>).github).toEqual(existing.mcpServers.github);
  });

  it('replaces outdated pacties entries and removes ones that no longer exist', () => {
    const existing = {
      mcpServers: {
        'pacties-planner': { command: 'npx', args: ['-y', 'pacties@0.0.1', 'mcp'] },
        'pacties-reviewer': { command: 'pacties', args: ['mcp', '--role', 'reviewer'] },
      },
    };
    const merged = mergeServersIntoMcpConfig(existing, specs);
    expect(merged.ok && merged.value.mcpServers).toEqual({
      'pacties-planner': { type: 'stdio', command: 'pacties', args: ['mcp', '--role', 'planner', '--repo', '${workspaceFolder}'] },
      'pacties-tester': { type: 'stdio', command: 'pacties', args: ['mcp', '--role', 'tester', '--repo', '${workspaceFolder}'] },
    });
  });

  it('treats a null mcpServers like a missing one', () => {
    const merged = mergeServersIntoMcpConfig({ mcpServers: null }, specs);
    expect(merged.ok && Object.keys(merged.value.mcpServers as object)).toEqual(['pacties-planner', 'pacties-tester']);
  });

  it('treats an empty object like a missing mcpServers key', () => {
    const merged = mergeServersIntoMcpConfig({}, specs);
    expect(merged.ok && Object.keys(merged.value.mcpServers as object)).toEqual(['pacties-planner', 'pacties-tester']);
  });

  it('does not mutate the existing config', () => {
    const existing = { mcpServers: { github: { command: 'gh' } } };
    const snapshot = structuredClone(existing);
    mergeServersIntoMcpConfig(existing, specs);
    expect(existing).toEqual(snapshot);
  });

  it.each([[[]], ['servers'], [42]])('refuses a config that is not an object: %j', (existing) => {
    expect(mergeServersIntoMcpConfig(existing, specs)).toEqual({ ok: false, error: 'the MCP config file must contain a JSON object' });
  });

  it.each([[[]], ['x'], [7]])('refuses mcpServers that is not an object: %j', (mcpServers) => {
    expect(mergeServersIntoMcpConfig({ mcpServers }, specs)).toEqual({ ok: false, error: '"mcpServers" in the MCP config file must be a JSON object' });
  });
});
