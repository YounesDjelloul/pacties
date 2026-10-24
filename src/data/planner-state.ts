import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { readJsonFile } from '@/data/json-files';
import type { PlannerReport } from '@/domain/wrapper/types';

const plannerReportSchema = z.object({
  activity: z.enum(['idle', 'busy']),
  sessionId: z.string().nullable(),
});

export async function writePlannerReportFile(filePath: string, report: PlannerReport): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(report), 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export async function readPlannerReportFile(filePath: string): Promise<PlannerReport | null> {
  return readJsonFile(filePath, plannerReportSchema).catch(() => null);
}
