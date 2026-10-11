import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createPactiesServer } from '@/mcp/server';
import { approveBehaviors } from '@/shell/ledger/approve-behaviors';
import { transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import { createTempProject, useTempWorkspace } from '@/test-support/temp-workspace';
import type { Project } from '@/domain/project/types';
import type { Role } from '@/domain/ledger/types';

const NOW = new Date('2026-10-25T00:59:59.999Z');

async function connect(role: Role, project: Project): Promise<Client> {
  const server = createPactiesServer(role, { project, now: () => NOW });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: `test-${role}`, version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
  return { isError: result.isError === true, text, json: () => JSON.parse(text) };
}

describe('pacties MCP server', () => {
  const workspace = useTempWorkspace();

  it('exposes the planner tools and no approval tool', async () => {
    const client = await connect('planner', await createTempProject(workspace()));
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['get_behavior', 'get_delta', 'list_behaviors', 'propose_behavior', 'update_behavior']);
  });

  it('exposes only reading tools to the tester', async () => {
    const client = await connect('tester', await createTempProject(workspace()));
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['get_behavior', 'get_delta', 'list_behaviors']);
  });

  it('gives each role its own instructions', async () => {
    const project = await createTempProject(workspace());
    const planner = await connect('planner', project);
    const tester = await connect('tester', project);
    expect(planner.getInstructions()).toContain('pacties approve');
    expect(tester.getInstructions()).toContain('do not read or infer the implementation');
  });

  it('proposes through the planner and hands the behavior to the tester once approved', async () => {
    const project = await createTempProject(workspace());
    const planner = await connect('planner', project);
    const tester = await connect('tester', project);

    const proposed = await call(planner, 'propose_behavior', transferOverDailyLimit as unknown as Record<string, unknown>);
    expect(proposed.json()).toMatchObject({ behavior: { id: 'B1', status: 'planned' }, nextStep: 'Ask the developer to review it and run: pacties approve B1' });
    expect((await call(tester, 'get_delta')).json().changes).toEqual([]);

    await approveBehaviors(project, [{ id: 'B1', version: 1 }], NOW);
    const delta = (await call(tester, 'get_delta')).json();
    expect(delta.changes.map((change: { id: string; change: string }) => [change.id, change.change])).toEqual([['B1', 'added']]);
  });

  it('accepts loosely written behavior ids', async () => {
    const project = await createTempProject(workspace());
    const planner = await connect('planner', project);
    await call(planner, 'propose_behavior', transferOverDailyLimit as unknown as Record<string, unknown>);
    expect((await call(planner, 'get_behavior', { id: ' b01 ' })).json().behavior.id).toBe('B1');
  });

  it('reports a domain failure as a readable error with its code', async () => {
    const planner = await connect('planner', await createTempProject(workspace()));
    const result = await call(planner, 'update_behavior', { id: 'B9', description: 'x', reason: 'y' });
    expect([result.isError, result.text]).toEqual([true, '[NOT_FOUND] B9 does not exist']);
  });

  it('reports a malformed behavior id as a validation error', async () => {
    const planner = await connect('planner', await createTempProject(workspace()));
    const result = await call(planner, 'get_behavior', { id: 'behavior-7' });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^\[VALIDATION\] "behavior-7" is not a behavior id/u);
  });

  it('rejects input of the wrong shape before reaching pacties', async () => {
    const planner = await connect('planner', await createTempProject(workspace()));
    const result = await call(planner, 'propose_behavior', { description: 'transfer over limit', contract: { interface: 'POST /transfer' } });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/interface/u);
  });

  it('hides drafts from the tester as if they did not exist', async () => {
    const project = await createTempProject(workspace());
    const planner = await connect('planner', project);
    const tester = await connect('tester', project);
    await call(planner, 'propose_behavior', transferOverDailyLimit as unknown as Record<string, unknown>);

    expect((await call(tester, 'list_behaviors')).json()).toEqual({ behaviors: [] });
    expect((await call(tester, 'get_behavior', { id: 'B1' })).text).toBe('[NOT_FOUND] B1 does not exist');
  });
});
