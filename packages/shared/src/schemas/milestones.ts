import { z } from 'zod';
import { Num, Int, Source } from './common.js';

export const MilestoneSchema = z.object({
  name: z.string(),
  xp: Int,
  achieved: z.boolean(),
  achievedOnTurn: Num,
  source: Source,
});
export type Milestone = z.infer<typeof MilestoneSchema>;
