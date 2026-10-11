import { z } from 'zod';

const behaviorIdSchema = z.string().regex(/^B[1-9]\d*$/u).transform((id) => id as `B${number}`);

const contentSchema = z.object({
  description: z.string(),
  contract: z.object({
    interface: z.array(z.string()),
    dependsOn: z.array(z.string()),
  }),
});

const eventBase = {
  seq: z.number().int().positive(),
  at: z.string(),
  actor: z.enum(['planner', 'developer', 'pacties']),
  behaviorId: behaviorIdSchema,
};

export const ledgerEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('behavior_proposed'), content: contentSchema }),
  z.object({ ...eventBase, type: z.literal('behavior_revised'), content: contentSchema, reason: z.string() }),
  z.object({ ...eventBase, type: z.literal('behavior_approved'), version: z.number().int().positive() }),
  z.object({ ...eventBase, type: z.literal('behavior_rejected'), version: z.number().int().positive(), reason: z.string() }),
]);

export const cursorsSchema = z.object({
  planner: z.number().int().nonnegative().default(0),
  tester: z.number().int().nonnegative().default(0),
});

export const repoIndexSchema = z.record(z.string(), z.string());

export const projectRecordSchema = z.object({
  repoId: z.string(),
  name: z.string(),
  rootCommit: z.string().nullable(),
  createdAt: z.string(),
});
