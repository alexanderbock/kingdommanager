import { z } from 'zod';
import { Num, Int } from './common.js';

export const AbilityKey = z.enum(['culture', 'economy', 'loyalty', 'stability']);
export const AbilityScore = z.object({
  score: Num,
  modifier: Num,
  notes: z.string(),
});

export const RuinKey = z.enum(['corruption', 'crime', 'decay', 'strife']);
export const RuinScore = z.object({
  value: Num,
  threshold: Num,
  penalty: Num,
});

export const CommodityKey = z.enum(['food', 'lumber', 'luxuries', 'ore', 'stone']);
export const Commodity = z.object({
  stored: Num,
  capacity: Num,
});

export const WorkSiteKey = z.enum(['farmland', 'lumber', 'mine', 'quarry']);
export const WorkSite = z.object({
  count: Num,
  resourceHexes: Num,
});

/** Singleton kingdom record. Every number here is typed in by a person. */
export const KingdomSchema = z.object({
  name: z.string(),
  charter: z.string(),
  heartland: z.string(),
  government: z.string(),
  level: Num,
  xp: Num,
  size: Num,
  controlDc: Num,
  unrest: Num,
  fame: Num,
  infamy: Num,
  resourcePoints: Num,
  resourceDice: z.object({
    count: Num,
    die: z.string(),
  }),
  consumption: Num,
  abilities: z.object({
    culture: AbilityScore,
    economy: AbilityScore,
    loyalty: AbilityScore,
    stability: AbilityScore,
  }),
  ruin: z.object({
    corruption: RuinScore,
    crime: RuinScore,
    decay: RuinScore,
    strife: RuinScore,
  }),
  commodities: z.object({
    food: Commodity,
    lumber: Commodity,
    luxuries: Commodity,
    ore: Commodity,
    stone: Commodity,
  }),
  workSites: z.object({
    farmland: WorkSite,
    lumber: WorkSite,
    mine: WorkSite,
    quarry: WorkSite,
  }),
  eventDc: Num,
  notes: z.string(),
  gmNotes: z.string(),
});
export type Kingdom = z.infer<typeof KingdomSchema>;

export const Proficiency = z.enum(['untrained', 'trained', 'expert', 'master', 'legendary']);

/** One of the 16 kingdom skills. `total` is typed in; `breakdown` is a free note, never parsed. */
export const KingdomSkillSchema = z.object({
  key: z.string(),
  name: z.string(),
  ability: AbilityKey,
  proficiency: Proficiency,
  total: Num,
  breakdown: z.string(),
  notes: z.string(),
});
export type KingdomSkill = z.infer<typeof KingdomSkillSchema>;

export const LeaderRole = z.enum([
  'ruler',
  'counselor',
  'general',
  'emissary',
  'magister',
  'marshal',
  'treasurer',
  'viceroy',
]);

export const LeaderSchema = z.object({
  role: LeaderRole,
  holderName: z.string(),
  isPC: z.boolean(),
  invested: z.boolean(),
  vacant: z.boolean(),
  activitiesPerTurn: Num,
  notes: z.string(),
});
export type Leader = z.infer<typeof LeaderSchema>;

export const FeatSchema = z.object({
  name: z.string(),
  levelTaken: Num,
  description: z.string(),
  source: z.string(),
});
export type Feat = z.infer<typeof FeatSchema>;

export const ModifierKind = z.enum(['circumstance', 'status', 'item', 'other']);

/** Reminder list only — modifiers are never applied automatically. */
export const ModifierSchema = z.object({
  name: z.string(),
  kind: ModifierKind,
  value: Int,
  appliesTo: z.string(),
  source: z.string(),
  expiresAtTurn: Num,
  active: z.boolean(),
  notes: z.string(),
});
export type Modifier = z.infer<typeof ModifierSchema>;
