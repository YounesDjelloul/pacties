import fs from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { InternalError } from '@/lib/errors';

export async function readJsonFile<S extends z.ZodType>(filePath: string, schema: S): Promise<z.output<S> | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new InternalError(`${filePath} is not valid JSON; fix or delete it`);
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new InternalError(`${filePath} has an unexpected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function writeJsonFileAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
