import type { Building, Settlement } from './schemas/settlements.js';

type SettlementType = Settlement['type'];

/**
 * Urban grid geometry. A settlement is made of 2x2 blocks (lots/squares);
 * village = 1 block, town = 4 (2x2 blocks), city = 9 (3x3 blocks),
 * metropolis = N 3x3 block grids stacked vertically.
 */
export interface SettlementGrid {
  cols: number;
  rows: number;
  totalCells: number;
  /** Number of 2x2 blocks. */
  blocks: number;
  /** Blocks per row. */
  blockCols: number;
}

export function settlementGrid(type: SettlementType, grids: number): SettlementGrid {
  const g = type === 'metropolis' ? Math.max(1, Math.floor(grids) || 1) : 1;
  const blockCols = type === 'village' ? 1 : type === 'town' ? 2 : 3;
  const blockRows = type === 'village' ? 1 : type === 'town' ? 2 : 3 * g;
  const cols = blockCols * 2;
  const rows = blockRows * 2;
  return { cols, rows, totalCells: cols * rows, blocks: blockCols * blockRows, blockCols };
}

/** Row-major cell indices of the 2x2 block at the given block index. */
export function blockCells(grid: SettlementGrid, blockIndex: number): number[] {
  const blockRow = Math.floor(blockIndex / grid.blockCols);
  const blockCol = blockIndex % grid.blockCols;
  const out: number[] = [];
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      out.push((blockRow * 2 + dr) * grid.cols + blockCol * 2 + dc);
    }
  }
  return out;
}

/** Index of the block containing the given cell. */
export function blockOfCell(grid: SettlementGrid, cell: number): number {
  const row = Math.floor(cell / grid.cols);
  const col = cell % grid.cols;
  return Math.floor(row / 2) * grid.blockCols + Math.floor(col / 2);
}

/** True when a w×h rectangle anchored at `anchor` fits entirely in the grid. */
export function fitsPlacement(grid: SettlementGrid, anchor: number, w: number, h: number): boolean {
  if (anchor < 0 || anchor >= grid.totalCells) return false;
  const row = Math.floor(anchor / grid.cols);
  const col = anchor % grid.cols;
  return w >= 1 && h >= 1 && col + w <= grid.cols && row + h <= grid.rows;
}

/** Row-major cells of the w×h rectangle at `anchor` (call fitsPlacement first). */
export function rectCells(grid: SettlementGrid, anchor: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) out.push(anchor + r * grid.cols + c);
  }
  return out;
}

/** Lots occupied by a building (new shape: w×h rectangle; legacy: stored cells). */
export function buildingCells(b: Building, grid: SettlementGrid): number[] {
  if ('cells' in b) return b.cells.filter((c) => c >= 0 && c < grid.totalCells);
  return rectCells(grid, b.anchor, b.w, b.h);
}

/** Top-left anchor and w×h extent of a building (legacy runs use their bounding box). */
export function buildingRect(b: Building, grid: SettlementGrid): { anchor: number; w: number; h: number } {
  if ('cells' in b) {
    const cells = b.cells.filter((c) => c >= 0 && c < grid.totalCells);
    if (cells.length === 0) return { anchor: 0, w: 1, h: 1 };
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minCol = Infinity;
    let maxCol = -Infinity;
    for (const c of cells) {
      const r = Math.floor(c / grid.cols);
      const col = c % grid.cols;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
    return { anchor: minRow * grid.cols + minCol, w: maxCol - minCol + 1, h: maxRow - minRow + 1 };
  }
  return { anchor: b.anchor, w: b.w, h: b.h };
}

export interface Overcrowding {
  /** Blocks containing at least one building. */
  occupiedBlocks: number;
  /** Lots covered by residential buildings. */
  residentialLots: number;
  /** True when residentialLots < occupiedBlocks (+1 Unrest per turn). */
  overcrowded: boolean;
}

/**
 * Rules: a settlement needs at least as many Residential lots as blocks that
 * have any structures built in them, otherwise it is Overcrowded.
 */
export function overcrowdingFor(settlement: Pick<Settlement, 'type' | 'grids' | 'buildings'>): Overcrowding {
  const grid = settlementGrid(settlement.type, settlement.grids);
  const occupied = new Set<number>();
  let residentialLots = 0;
  for (const b of settlement.buildings) {
    const cells = buildingCells(b, grid);
    if (b.residential) residentialLots += cells.length;
    for (const c of cells) occupied.add(blockOfCell(grid, c));
  }
  return { occupiedBlocks: occupied.size, residentialLots, overcrowded: residentialLots < occupied.size };
}