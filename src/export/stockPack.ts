import { formatInches } from "../units/length";

/** Saw kerf between adjacent cuts on the same stick. Counted in waste, not as a packing blocker. */
export const KERF_IN = 0.125;

/** Home Depot / Lowe’s common 2x lengths. */
export const DIM_STOCK_FT = [8, 10, 12, 16, 20] as const;

/** Common 4x4 / 6x6 post lengths. Unset height buys the shortest (8'). */
export const POST_STOCK_FT = [8, 10, 12] as const;

/** Decking: prefer 12' and 16'; 20' only when a piece needs it. */
export const DECK_STOCK_FT = [12, 16, 20] as const;

export const UNSET_POST_LEN_IN = 8 * 12;

export interface PackPiece {
  lenIn: number;
  objectId: string;
  /** True when this remnant came from a run longer than max stock. */
  split?: boolean;
}

export interface PackedStick {
  stockFt: number;
  pieces: PackPiece[];
}

export interface StockBuy {
  stockFt: number;
  qty: number;
  objectIds: string[];
  exceededMax: boolean;
}

export interface PackResult {
  sticks: PackedStick[];
  buys: StockBuy[];
  netIn: number;
  stockIn: number;
  kerfIn: number;
  leftoverIn: number;
  percent: number;
}

export function splitOversize(
  lenIn: number,
  maxIn: number,
): { lenIn: number; split: boolean }[] {
  if (lenIn <= 0) return [];
  if (lenIn <= maxIn + 1e-9) return [{ lenIn, split: false }];
  const parts: { lenIn: number; split: boolean }[] = [];
  let left = lenIn;
  while (left > maxIn + 1e-9) {
    parts.push({ lenIn: maxIn, split: true });
    left -= maxIn;
  }
  if (left > 1e-9) parts.push({ lenIn: left, split: true });
  return parts;
}

function remainingIn(stick: PackedStick): number {
  return stick.stockFt * 12 - stick.pieces.reduce((n, p) => n + p.lenIn, 0);
}

/**
 * First-fit decreasing. New sticks use the shortest stock that can hold the piece.
 * Fit is sum of piece lengths ≤ stock (kerf is waste, so 6'+6' packs onto one 12').
 */
export function packPieces(pieces: PackPiece[], stockFt: readonly number[]): PackResult {
  const stocks = [...stockFt].sort((a, b) => a - b);
  const maxIn = (stocks[stocks.length - 1] ?? 0) * 12;
  const expanded: PackPiece[] = [];
  for (const p of pieces) {
    if (p.lenIn <= 1e-9) continue;
    for (const part of splitOversize(p.lenIn, maxIn)) {
      expanded.push({ lenIn: part.lenIn, objectId: p.objectId, split: part.split || p.split });
    }
  }
  expanded.sort((a, b) => b.lenIn - a.lenIn || a.objectId.localeCompare(b.objectId));

  const sticks: PackedStick[] = [];
  for (const piece of expanded) {
    const host = sticks.find((s) => remainingIn(s) + 1e-9 >= piece.lenIn);
    if (host) {
      host.pieces.push(piece);
      continue;
    }
    const stock = stocks.find((ft) => ft * 12 + 1e-9 >= piece.lenIn) ?? stocks[stocks.length - 1];
    if (stock == null) continue;
    sticks.push({ stockFt: stock, pieces: [piece] });
  }

  const byFt = new Map<number, { qty: number; objectIds: string[]; exceededMax: boolean }>();
  for (const s of sticks) {
    const g = byFt.get(s.stockFt) ?? { qty: 0, objectIds: [], exceededMax: false };
    g.qty += 1;
    for (const p of s.pieces) {
      if (!g.objectIds.includes(p.objectId)) g.objectIds.push(p.objectId);
      if (p.split) g.exceededMax = true;
    }
    byFt.set(s.stockFt, g);
  }
  const buys = [...byFt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stockFt, g]) => ({ stockFt, ...g }));

  const netIn = expanded.reduce((s, p) => s + p.lenIn, 0);
  const stockIn = sticks.reduce((s, st) => s + st.stockFt * 12, 0);
  const kerfIn = sticks.reduce((s, st) => s + Math.max(0, st.pieces.length - 1) * KERF_IN, 0);
  const leftoverIn = Math.max(0, stockIn - netIn - kerfIn);
  const percent = stockIn > 0 ? (leftoverIn / stockIn) * 100 : 0;
  return { sticks, buys, netIn, stockIn, kerfIn, leftoverIn, percent };
}

export function formatWasteLine(size: string, leftoverIn: number, percent: number): string {
  if (leftoverIn < 0.5) return `${size} waste ~0`;
  return `${size} waste ${formatInches(leftoverIn)} (${Math.round(percent)}%)`;
}

export function shopLineText(qty: number, size: string, stockFt: number, exceededMax: boolean): string {
  const note = exceededMax ? " (run exceeded max stick)" : "";
  return `${qty} — ${size} × ${stockFt}'${note}`;
}
