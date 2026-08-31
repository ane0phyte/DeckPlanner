import { formatInches } from "../units/length";

/** Saw kerf between adjacent cuts on the same stick. Counted in waste, not as a packing blocker. */
export const KERF_IN = 0.125;

/** Common stick lengths only. Do not buy 10' or 20'. */
export const STOCK_FT = [6, 8, 12, 16] as const;

export const DIM_STOCK_FT = STOCK_FT;
export const POST_STOCK_FT = STOCK_FT;
export const DECK_STOCK_FT = STOCK_FT;

export const UNSET_POST_LEN_IN = 8 * 12;

export interface PackPiece {
  lenIn: number;
  objectId: string;
  /** True when this remnant came from a run longer than max stock. */
  split?: boolean;
  /** Unset-height posts: one 8' stick each, not packed onto a longer stick. */
  exclusive?: boolean;
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

function shortestStockFt(usedIn: number, stocks: number[]): number {
  const fit = stocks.find((ft) => ft * 12 + 1e-9 >= usedIn);
  return fit ?? stocks[stocks.length - 1] ?? 0;
}

/** Fewest sticks from `stockFt` whose lengths cover `lenIn`, then least leftover. */
export function coverLength(lenIn: number, stockFt: readonly number[]): number[] {
  const stocks = [...stockFt].filter((ft) => ft > 0).sort((a, b) => a - b);
  const maxFt = stocks[stocks.length - 1] ?? 0;
  const maxIn = maxFt * 12;
  if (lenIn <= 1e-9 || maxIn <= 0) return [];
  const kMin = Math.max(1, Math.ceil(lenIn / maxIn - 1e-12));
  for (let k = kMin; k <= kMin + stocks.length + 2; k++) {
    const combo = bestKStocks(lenIn, stocks, k);
    if (combo) return combo;
  }
  return Array.from({ length: kMin }, () => maxFt);
}

function bestKStocks(lenIn: number, stocks: number[], k: number): number[] | null {
  let best: number[] | null = null;
  let bestSum = Infinity;
  const rec = (start: number, chosen: number[], sumFt: number) => {
    if (chosen.length === k) {
      const sumIn = sumFt * 12;
      if (sumIn + 1e-9 >= lenIn && sumIn < bestSum - 1e-9) {
        bestSum = sumIn;
        best = [...chosen];
      }
      return;
    }
    for (let i = start; i < stocks.length; i++) {
      chosen.push(stocks[i]);
      rec(i, chosen, sumFt + stocks[i]);
      chosen.pop();
      if (bestSum <= lenIn + 1e-9) return;
    }
  };
  rec(0, [], 0);
  return best;
}

/**
 * Split a run longer than max stock into the fewest 16'/12'/8'/6' end-to-end pieces
 * (then least leftover). Pieces that already fit return unchanged.
 */
export function splitOversize(
  lenIn: number,
  stockFt: readonly number[],
): { lenIn: number; split: boolean }[] {
  if (lenIn <= 1e-9) return [];
  const stocks = [...stockFt].filter((ft) => ft > 0).sort((a, b) => a - b);
  const maxIn = (stocks[stocks.length - 1] ?? 0) * 12;
  if (lenIn <= maxIn + 1e-9) return [{ lenIn, split: false }];
  const cover = coverLength(lenIn, stocks).sort((a, b) => b - a);
  const parts: { lenIn: number; split: boolean }[] = [];
  let left = lenIn;
  for (const ft of cover) {
    const take = Math.min(ft * 12, left);
    if (take > 1e-9) parts.push({ lenIn: take, split: true });
    left -= take;
  }
  return parts;
}

/**
 * Pack into the fewest sticks, then least leftover.
 * 1. First-fit decreasing onto max stock (16').
 * 2. Shrink each stick to the shortest of {6,8,12,16} that still holds its cuts.
 * Fit is sum of piece lengths ≤ stock (kerf is waste).
 */
export function packPieces(pieces: PackPiece[], stockFt: readonly number[]): PackResult {
  const stocks = [...stockFt].filter((ft) => ft > 0).sort((a, b) => a - b);
  const maxFt = stocks[stocks.length - 1] ?? 0;
  const expanded: PackPiece[] = [];
  for (const p of pieces) {
    if (p.lenIn <= 1e-9) continue;
    if (p.exclusive) {
      expanded.push({ ...p, split: Boolean(p.split) });
      continue;
    }
    for (const part of splitOversize(p.lenIn, stocks)) {
      expanded.push({
        lenIn: part.lenIn,
        objectId: p.objectId,
        split: part.split || p.split,
      });
    }
  }
  const shared = expanded.filter((p) => !p.exclusive);
  shared.sort((a, b) => b.lenIn - a.lenIn || a.objectId.localeCompare(b.objectId));
  const solos = expanded.filter((p) => p.exclusive);

  const sticks: PackedStick[] = [];
  const remainingOnMax = (s: PackedStick) => maxFt * 12 - s.pieces.reduce((n, p) => n + p.lenIn, 0);
  for (const piece of shared) {
    const host = sticks.find((s) => remainingOnMax(s) + 1e-9 >= piece.lenIn);
    if (host) {
      host.pieces.push(piece);
      continue;
    }
    sticks.push({ stockFt: maxFt, pieces: [piece] });
  }
  for (const s of sticks) {
    const used = s.pieces.reduce((n, p) => n + p.lenIn, 0);
    s.stockFt = shortestStockFt(used, stocks);
  }
  for (const piece of solos) {
    sticks.push({
      stockFt: shortestStockFt(piece.lenIn, stocks),
      pieces: [piece],
    });
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
