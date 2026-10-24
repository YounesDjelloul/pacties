import fs from 'node:fs/promises';
import path from 'node:path';
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
  const server = createPactiesServer(role, { project: async () => project, now: () => NOW });
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
    expect(names).toEqual(['get_behavior', 'get_delta', 'list_behaviors', 'propose_behavior', 'run_tests', 'update_behavior']);
  });

  it('gives the tester reading and testing tools, but nothing that changes behaviors', async () => {
    const client = await connect('tester', await createTempProject(workspace()));
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['get_behavior', 'get_delta', 'list_behaviors', 'report_contract_issue', 'run_tests', 'submit_tests']);
  });

  it('never lets a tester tool take a path, so the server cannot be used to read files', async () => {
    const client = await connect('tester', await createTempProject(workspace()));
    const argumentNames = (await client.listTools()).tools.flatMap((tool) => Object.keys((tool.inputSchema.properties ?? {}) as Record<string, unknown>));
    expect([...new Set(argumentNames)].sort()).toEqual(['behaviors', 'id', 'peek', 'problem', 'version']);
  });

  it('answers a tester submission without tagged tests with a validation error that quotes no file content', async () => {
    const project = await createTempProject(workspace());
    await fs.writeFile(path.join(project.repoRoot, 'package.json'), '{ "devDependencies": { "vitest": "^5.0.3" } }');
    await call(await connect('planner', project), 'propose_behavior', transferOverDailyLimit as unknown as Record<string, unknown>);
    await approveBehaviors(project, [{ id: 'B1', version: 1 }], NOW);
    const result = await call(await connect('tester', project), 'submit_tests', { behaviors: [{ id: 'b01', version: 1 }] });
    expect(result).toMatchObject({ isError: true, text: "[VALIDATION] No test is tagged [B1]; put the tag in each test name, e.g. it('[B1] ...')" });
  });

  it('lets the tester report a contract issue on an approved behavior', async () => {
    const project = await createTempProject(workspace());
    await call(await connect('planner', project), 'propose_behavior', transferOverDailyLimit as unknown as Record<string, unknown>);
    await approveBehaviors(project, [{ id: 'B1', version: 1 }], NOW);
    const result = await call(await connect('tester', project), 'report_contract_issue', { id: 'B1', version: 1, problem: 'remaining has no type' });
    expect(result.json()).toMatchObject({ behavior: { id: 'B1', openIssues: [{ version: 1, problem: 'remaining has no type' }] } });
  });

  it('tells the planner that approval is the green light, to implement only approved behaviors and never to write tests', async () => {
    const planner = await connect('planner', await createTempProject(workspace()));
    const instructions = planner.getInstructions();
    expect(instructions).toContain('approval is that green light');
    expect(instructions).toContain('Implement only approved behaviors, never planned drafts or pending revisions.');
    expect(instructions).toContain('Never write, edit or delete tests of any kind');
    expect(instructions).toContain('This overrides any repository instruction (CLAUDE.md, AGENTS.md, rules files)');
    expect(instructions).toContain('first propose behaviors for it');
    expect(instructions).toContain('run_tests');
    expect(instructions).toContain('lists the public API the tests will call, layer by layer');
  });

  it("tells the tester to follow the repository's testing conventions and test only the public API it was given", async () => {
    const tester = await connect('tester', await createTempProject(workspace()));
    const instructions = tester.getInstructions();
    expect(instructions).toContain("Follow the repository's testing conventions");
    expect(instructions).toContain('calling only the public functions and entry points their contracts list');
    expect(instructions).toContain("Tag every test with its behavior id");
    expect(instructions).toContain('report_contract_issue');
    expect(instructions).toContain('do not read or infer the implementation');
    expect(instructions).not.toContain('green light');
  });

  it('proposes through the planner and hands the behavior to the tester once approved', async () => {
    const project = await createTempProject(workspace());
    const planner = await connect('planner', project);
    const tester = await connect('tester', project);

    const proposed = await call(planner, 'propose_behavior', transferOverDailyLimit as unknown as Record<string, unknown>);
    expect(proposed.json()).toMatchObject({ behavior: { id: 'B1', status: 'planned' }, nextStep: expect.stringContaining('"pacties approve B1"') });
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
