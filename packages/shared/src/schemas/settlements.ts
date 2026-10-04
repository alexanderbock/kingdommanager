import { z } from 'zod';
import { Num, Int, Source } from './common.js';

export const SettlementType = z.enum(['village', 'town', 'city', 'metropolis']);

/**
 * A building placed on the settlement's urban grid as a w×h rectangle of
 * lots (squares) whose top-left lot is `anchor` (row-major index).
 * The legacy shape (row-major run of `size` lots in `cells`) is still
 * accepted so existing records stay saveable; the UI rewrites it to the
 * rectangle shape when the building is next edited.
 */
export const BuildingSchema = z.union([
  z.object({
    id: z.string(),
    name: z.string(),
    /** Width (x) in lots. */
    w: Int,
    /** Height (y) in lots. */
    h: Int,
    /** Top-left lot of the rectangle (row-major). */
    anchor: Int,
    notes: z.string(),
    residential: z.boolean(),
    /** Optional image URL; assumed to match the building's aspect ratio. */
    image: z.string().optional(),
    /** Optional external link (e.g. an Archives of Nethys page). */
    link: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    name: z.string(),
    size: Int,
    notes: z.string(),
    residential: z.boolean(),
    image: z.string().optional(),
    link: z.string().optional(),
    cells: z.array(Int),
  }),
]);
export type Building = z.infer<typeof BuildingSchema>;

export const SettlementSchema = z.object({
  name: z.string(),
  /** village = 1 block, town = 4, city = 9, metropolis = 9 per grid. */
  type: SettlementType,
  /** Number of 9-block urban grids; only used for metropolis (min 1). */
  grids: Int,
  location: z.string(),
  buildings: z.array(BuildingSchema),
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
