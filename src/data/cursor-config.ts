import path from 'node:path';
import { z } from 'zod';
import { readJsonFile, writeJsonFileAtomically } from '@/data/json-files';
import { config } from '@/lib/config';

export function cursorMcpConfigPath(): string {
  return path.join(config.cursorHome, 'mcp.json');
}

export async function readCursorMcpConfig(): Promise<unknown> {
  return readJsonFile(cursorMcpConfigPath(), z.unknown());
}

export async function writeCursorMcpConfig(value: unknown): Promise<void> {
  await writeJsonFileAtomically(cursorMcpConfigPath(), value);
}
