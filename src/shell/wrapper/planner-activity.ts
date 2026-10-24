import { readPlannerReportFile, writePlannerReportFile } from '@/data/planner-state';
import { readPlannerReport } from '@/domain/clients/planner-session';
import type { PlannerReport } from '@/domain/wrapper/types';

export async function recordPlannerActivity(reportFile: string, activity: string, hookInput: unknown): Promise<void> {
  const report = readPlannerReport(activity, hookInput);
  if (report !== null) {
    await writePlannerReportFile(reportFile, report);
  }
}

export function readRecordedPlannerReport(reportFile: string): Promise<PlannerReport | null> {
  return readPlannerReportFile(reportFile);
}
