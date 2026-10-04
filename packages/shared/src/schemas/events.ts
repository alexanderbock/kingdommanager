import { z } from 'zod';
import { Num } from './common.js';

export const EventKind = z.enum(['random', 'story', 'continuous']);
export const EventStatus = z.enum(['active', 'resolved', 'failed']);

export const KingdomEventSchema = z.object({
  name: z.string(),
  level: Num,
  kind: EventKind,
  status: EventStatus,
  startedTurn: Num,
  resolvedTurn: Num,
  skillOptions: z.string(),
  publicDescription: z.string(),
  gmNotes: z.string(),
  outcome: z.string(),
  xpAwarded: Num,
});
export type KingdomEvent = z.infer<typeof KingdomEventSchema>;
