import { z } from 'zod';
import { Num, Int, Source } from './common.js';

export const SettlementType = z.enum(['village', 'town', 'city', 'metropolis']);

export const LotSchema = z.object({
  index: Int,
  structureInstanceId: z.string().nullable(),
});

export const BlockSchema = z.object({
  index: Int,
  lots: z.array(LotSchema),
  streetNotes: z.string(),
});

export const SettlementSchema = z.object({
  name: z.string(),
  type: SettlementType,
  level: Num,
  influence: Num,
  maxItemBonus: Num,
  consumption: Num,
  isCapital: z.boolean(),
  /** false = unconnected settlement (house-rule freehold: -4 to related checks, +1 Unrest) */
  isConnected: z.boolean(),
  hex: z.string(),
  waterBorders: z.object({
    n: z.boolean(),
    e: z.boolean(),
    s: z.boolean(),
    w: z.boolean(),
  }),
  walls: z.string(),
  civicActivityUsedThisTurn: z.boolean(),
  notes: z.string(),
  gmNotes: z.string(),
  /** 3x3 urban grid of blocks, each with 4 lots. */
  blocks: z.array(BlockSchema),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const StructureStatus = z.enum(['planned', 'under-construction', 'built', 'damaged', 'destroyed']);

export const StructureInstanceSchema = z.object({
  settlementId: z.string(),
  structureDefId: z.string().nullable(),
  customName: z.string(),
  lotIndices: z.array(z.object({ block: Int, lot: Int })),
  status: StructureStatus,
  builtOnTurn: Num,
  notes: z.string(),
});
export type StructureInstance = z.infer<typeof StructureInstanceSchema>;

/** Catalog entry. All costs/DCs are typed in by the GM; text fields are never parsed. */
export const StructureDefSchema = z.object({
  name: z.string(),
  level: Num,
  lots: Int,
  traits: z.array(z.string()),
  costRp: Num,
  costLumber: Num,
  costStone: Num,
  costOre: Num,
  costLuxuries: Num,
  constructionSkill: z.string(),
  constructionDc: Num,
  upgradeFrom: z.string(),
  upgradeTo: z.string(),
  itemBonusesText: z.string(),
  effectsText: z.string(),
  ruinText: z.string(),
  source: Source,
  /** Unknown keys from JSON imports are kept here. */
  raw: z.any().optional(),
});
export type StructureDef = z.infer<typeof StructureDefSchema>;
