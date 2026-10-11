import { z } from 'zod';
import { Num, Int, Source } from './common.js';

/** Static milestone definition (seed/milestones.json, read at runtime). */
export const MilestoneDefSchema = z.object({
  key: z.string(),
  name: z.string(),
  xp: Int,
  source: Source,
});
export type MilestoneDef = z.infer<typeof MilestoneDefSchema>;

/** The part of a milestone stored in the database. */
export const MilestoneStateSchema = z.object({
  achieved: z.boolean(),
  achievedOnTurn: Num,
});
export type MilestoneState = z.infer<typeof MilestoneStateSchema>;

export const MilestoneSchema = MilestoneDefSchema.merge(MilestoneStateSchema);
export type Milestone = z.infer<typeof MilestoneSchema>;
