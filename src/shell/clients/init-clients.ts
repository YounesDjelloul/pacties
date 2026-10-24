import { isCommandAvailable } from '@/data/commands';
import { readRepoRoot } from '@/data/git';
import { readPactiesConfig, writePactiesConfig } from '@/data/pacties-config';
import { withHomeLock } from '@/data/storage-lock';
import { CLIENT_IDS } from '@/domain/clients/constants';
import { mergeServersIntoMcpConfig } from '@/domain/clients/merge-mcp-config';
import { buildPlannerServerSpec, chooseLauncher } from '@/domain/clients/server-specs';
import { ValidationError } from '@/lib/errors';
import { CLIENT_ADAPTERS, type ClientAdapter } from '@/shell/clients/client-registry';
import { resolveProject } from '@/shell/project/resolve-project';
import type { ClientId } from '@/domain/clients/types';
import type { Project } from '@/domain/project/types';

export type DetectedClient = {
  id: ClientId;
  displayName: string;
  detected: boolean;
};

export type ClientRegistration = {
  id: ClientId;
  displayName: string;
  ok: boolean;
  detail: string;
};

export type InitOutcome = {
  project: Project;
  registrations: ClientRegistration[];
};

export async function detectClients(): Promise<DetectedClient[]> {
  return Promise.all(
    CLIENT_IDS.map(async (id) => ({ id, displayName: CLIENT_ADAPTERS[id].displayName, detected: await CLIENT_ADAPTERS[id].detect() })),
  );
}

export async function initClients(repoPath: string, clientIds: ClientId[], now: Date): Promise<InitOutcome> {
  const project = await resolveProject(repoPath, now);
  await requireRepoRoot(repoPath);
  const launcher = chooseLauncher(await isCommandAvailable('pacties'));
  const registrations = await forEachClient(clientIds, (adapter) => adapter.register(launcher, project));

  const registered = succeeded(registrations);
  await withHomeLock(async (lock) => {
    const current = await readPactiesConfig();
    await writePactiesConfig({ clients: [...new Set([...current.clients, ...registered])] }, lock);
  });

  return { project, registrations };
}

export async function removeClients(repoPath: string, clientIds: ClientId[], now: Date): Promise<InitOutcome> {
  const project = await resolveProject(repoPath, now);
  await requireRepoRoot(repoPath);
  const registrations = await forEachClient(clientIds, (adapter) => adapter.unregister(project));

  const removed = succeeded(registrations);
  await withHomeLock(async (lock) => {
    const current = await readPactiesConfig();
    await writePactiesConfig({ clients: current.clients.filter((id) => !removed.includes(id)) }, lock);
  });

  return { project, registrations };
}

async function forEachClient(clientIds: ClientId[], work: (adapter: ClientAdapter) => Promise<string>): Promise<ClientRegistration[]> {
  const registrations: ClientRegistration[] = [];
  for (const id of clientIds) {
    const adapter = CLIENT_ADAPTERS[id];
    try {
      registrations.push({ id, displayName: adapter.displayName, ok: true, detail: await work(adapter) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      registrations.push({ id, displayName: adapter.displayName, ok: false, detail });
    }
  }
  return registrations;
}

function succeeded(registrations: ClientRegistration[]): ClientId[] {
  return registrations.filter((registration) => registration.ok).map((registration) => registration.id);
}

export async function manualServerConfig(repoPath: string): Promise<Record<string, unknown>> {
  const repoRoot = await requireRepoRoot(repoPath);
  const launcher = chooseLauncher(await isCommandAvailable('pacties'));
  const merged = mergeServersIntoMcpConfig(null, [buildPlannerServerSpec(launcher, repoRoot)]);
  return merged.ok ? merged.value : {};
}

async function requireRepoRoot(repoPath: string): Promise<string> {
  const repoRoot = await readRepoRoot(repoPath);
  if (repoRoot === null) {
    throw new ValidationError(`pacties needs a git repository, but ${repoPath} is not inside one; run "git init" there first`);
  }
  return repoRoot;
}
