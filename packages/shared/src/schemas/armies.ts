import { z } from 'zod';
import { Num } from './common.js';

export const ArmyType = z.enum(['infantry', 'cavalry', 'skirmisher', 'siege', 'other']);
export const ArmyStatus = z.enum(['active', 'garrisoned', 'routed', 'destroyed']);

/** All army numbers are typed in by hand. */
export const ArmySchema = z.object({
  name: z.string(),
  type: ArmyType,
  level: Num,
  hp: Num,
  maxHp: Num,
  ac: Num,
  maneuver: Num,
  morale: Num,
  attacks: z.array(z.object({ name: z.string(), bonus: Num, notes: z.string() })),
  tactics: z.array(z.string()),
  gear: z.array(z.string()),
  conditions: z.array(z.string()),
  location: z.string(),
  consumption: Num,
  recruitedOnTurn: Num,
  status: ArmyStatus,
  notes: z.string(),
});
export type Army = z.infer<typeof ArmySchema>;
