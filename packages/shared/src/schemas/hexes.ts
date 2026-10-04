import { z } from 'zod';
import { Num } from './common.js';

/** Known terrain features. Bridge/Landmark/Refuge/Resource may overlap; the rest are mutually exclusive (house rule). */
export const HEX_FEATURES = [
  'Bridge',
  'Landmark',
  'Refuge',
  'Resource',
  'Farmland',
  'Freehold',
  'Ruins',
  'Settlement',
  'Structure',
  'Work Site',
] as const;

/** Features that may not coexist on one hex (house-rule "Restricted" list). */
export const RESTRICTED_HEX_FEATURES = [
  'Farmland',
  'Freehold',
  'Ruins',
  'Settlement',
  'Structure',
  'Work Site',
] as const;

export const HexSchema = z.object({
  coord: z.string(),
  terrain: z.string(),
  claimed: z.boolean(),
  /** Supports the house-rule Reconnoiter Hex activity. */
  reconnoitered: z.boolean(),
  features: z.array(z.string()),
  workSite: z.string(),
  road: z.boolean(),
  notes: z.string(),
  gmNotes: z.string(),
});
export type Hex = z.infer<typeof HexSchema>;

export const FactionRelation = z.enum(['none', 'diplomatic', 'trade', 'fealty', 'hostile']);

export const FactionSchema = z.object({
  name: z.string(),
  relation: FactionRelation,
  negotiationDc: Num,
  /** House rule: the Request Foreign Aid DC changes turn to turn, so it is typed in. */
  currentForeignAidDc: Num,
  lastAidRequestTurn: Num,
  notes: z.string(),
});
export type Faction = z.infer<typeof FactionSchema>;
