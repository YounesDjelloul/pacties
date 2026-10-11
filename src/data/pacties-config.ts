import path from 'node:path';
import { z } from 'zod';
import { readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { CLIENT_IDS } from '@/domain/clients/constants';
import { config } from '@/lib/config';
import type { ClientId } from '@/domain/clients/types';

export type PactiesConfig = {
  clients: ClientId[];
};

const pactiesConfigSchema = z.object({ clients: z.array(z.enum(CLIENT_IDS)).default([]) });

export async function readPactiesConfig(): Promise<PactiesConfig> {
  return (await readJsonFile(configPath(), pactiesConfigSchema)) ?? { clients: [] };
}

export async function writePactiesConfig(value: PactiesConfig, lock: StorageLock): Promise<void> {
  assertLockHeld(lock, config.pactiesHome);
  await writeJsonFileAtomically(configPath(), value);
}

function configPath(): string {
  return path.join(config.pactiesHome, 'config.json');
}
