import fs from 'node:fs/promises';
import { ledgerEventSchema } from '@/data/schemas';
import { isMissingFile } from '@/data/json-files';
import { assertLockHeld, type StorageLock } from '@/data/storage-lock';
import { eventsPath } from '@/data/storage-paths';
import { InternalError } from '@/lib/errors';
import type { LedgerEvent } from '@/domain/ledger/types';

export async function readEvents(projectDir: string): Promise<LedgerEvent[]> {
  const raw = await readLogText(projectDir);
  const completeText = raw.slice(0, raw.lastIndexOf('\n') + 1);
  return completeText
    .split('\n')
    .slice(0, -1)
    .map((line, index) => parseLine(line, index + 1, projectDir));
}

export async function appendEvents(projectDir: string, events: LedgerEvent[], lock: StorageLock): Promise<void> {
  assertLockHeld(lock, projectDir);
  if (events.length === 0) {
    return;
  }
  await dropTornTail(projectDir);
  const lines = events.map((event) => `${JSON.stringify(event)}\n`).join('');
  await fs.appendFile(eventsPath(projectDir), lines, 'utf8');
}

async function readLogText(projectDir: string): Promise<string> {
  try {
    return await fs.readFile(eventsPath(projectDir), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return '';
    }
    throw error;
  }
}

async function dropTornTail(projectDir: string): Promise<void> {
  const raw = await readLogText(projectDir);
  if (raw.length === 0 || raw.endsWith('\n')) {
    return;
  }
  const completeLength = Buffer.byteLength(raw.slice(0, raw.lastIndexOf('\n') + 1), 'utf8');
  await fs.truncate(eventsPath(projectDir), completeLength);
}

function parseLine(line: string, lineNumber: number, projectDir: string): LedgerEvent {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    throw corruptLine(projectDir, lineNumber, 'not valid JSON');
  }
  const parsed = ledgerEventSchema.safeParse(json);
  if (!parsed.success) {
    throw corruptLine(projectDir, lineNumber, parsed.error.issues[0]?.message ?? 'unexpected shape');
  }
  return parsed.data;
}

function corruptLine(projectDir: string, lineNumber: number, detail: string): InternalError {
  return new InternalError(`${eventsPath(projectDir)} line ${lineNumber} is corrupt (${detail}); the ledger cannot be read until it is fixed`);
}
