import { z } from 'zod';
import { Num, Int } from './common.js';

export const AbilityKey = z.enum(['culture', 'economy', 'loyalty', 'stability']);
export const AbilityScore = z.object({
  score: Num,
  modifier: Num,
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

export const WorkSiteType = z.enum(['farmland', 'lumber', 'mine', 'quarry']);
export const WorkSite = z.object({
  id: z.string(),
  type: WorkSiteType,
  resourceHexes: Num,
  location: z.string(),
  comments: z.string(),
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
  workSites: z.array(WorkSite),
  /** House rule: untrained kingdom skills use level/2 instead of 0. */
  untrainedImprovisation: z.boolean(),
  notes: z.string(),
});
export type Kingdom = z.infer<typeof KingdomSchema>;

export const Proficiency = z.enum(['untrained', 'trained', 'expert', 'master', 'legendary']);

/** Static skill definition (seed/skills.json, read at runtime). */
export const KingdomSkillDefSchema = z.object({
  key: z.string(),
  name: z.string(),
  ability: AbilityKey,
});
export type KingdomSkillDef = z.infer<typeof KingdomSkillDefSchema>;

/** The part of a skill stored in the database. `total` is typed in; `breakdown` is a free note, never parsed. */
export const KingdomSkillStateSchema = z.object({
  proficiency: Proficiency,
  total: Num,
  breakdown: z.string(),
  notes: z.string(),
});
export type KingdomSkillState = z.infer<typeof KingdomSkillStateSchema>;

/** One of the 16 kingdom skills: definition merged with its stored state. */
export const KingdomSkillSchema = KingdomSkillDefSchema.merge(KingdomSkillStateSchema);
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

/** The part of a leader stored in the database (the role is the record id). */
export const LeaderStateSchema = z.object({
  holderName: z.string(),
  isPC: z.boolean(),
  invested: z.boolean(),
  vacant: z.boolean(),
  activitiesPerTurn: Num,
  notes: z.string(),
});
export type LeaderState = z.infer<typeof LeaderStateSchema>;

export const LeaderSchema = z.object({ role: LeaderRole }).merge(LeaderStateSchema);
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
