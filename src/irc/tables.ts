import { ftIn, interpolate } from "../units/length";
import type { DeckingCategory, FastenerKind } from "../model/types";

/** Live load used by v1. Table R301.5 decks = 40 psf. No site snow number. */
export const LIVE_PSF = 40;

/** Dead load baked into the 2024 R507 tables. Snow is not concurrent with live. */
export const DEAD_PSF_IN_TABLES = 10;

export const DEFLECTION_MAIN = 360;
export const DEFLECTION_CANTILEVER = 180;

export const JOIST_SIZES = ["2x6", "2x8", "2x10", "2x12"] as const;
export type JoistSize = (typeof JOIST_SIZES)[number];

export const SPACINGS = [12, 16, 24] as const;
export type SpacingIn = (typeof SPACINGS)[number];

/**
 * 2024 Table R507.6 Southern pine, 40 live, spans in inches at 12 / 16 / 24 in o.c.
 * Verified cells only.
 */
export const JOIST_SPAN_R507_6: Record<JoistSize, Record<SpacingIn, number>> = {
  "2x6": { 12: ftIn(9, 11), 16: ftIn(9, 0), 24: ftIn(7, 7) },
  "2x8": { 12: ftIn(13, 1), 16: ftIn(11, 10), 24: ftIn(9, 8) },
  "2x10": { 12: ftIn(16, 2), 16: ftIn(14, 0), 24: ftIn(11, 5) },
  "2x12": { 12: ftIn(18, 0), 16: ftIn(16, 6), 24: ftIn(13, 6) },
};

/**
 * 2024 Table R507.6 cantilever vs back span.
 * Columns: back span 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 ft.
 * Values in inches. null = NP.
 */
export const CANTILEVER_BACKSPANS_FT = [4, 6, 8, 10, 12, 14, 16, 18] as const;

export const JOIST_CANTILEVER_R507_6: Record<JoistSize, (number | null)[]> = {
  "2x6": [ftIn(1, 0), ftIn(1, 6), ftIn(1, 5), null, null, null, null, null],
  "2x8": [ftIn(1, 0), ftIn(1, 6), ftIn(2, 0), ftIn(2, 6), ftIn(2, 3), null, null, null],
  "2x10": [ftIn(1, 0), ftIn(1, 6), ftIn(2, 0), ftIn(2, 6), ftIn(3, 0), ftIn(3, 4), ftIn(3, 4), null],
  "2x12": [ftIn(1, 0), ftIn(1, 6), ftIn(2, 0), ftIn(2, 6), ftIn(3, 0), ftIn(3, 6), ftIn(4, 0), ftIn(4, 1)],
};

export function nearestSpacing(spacingIn: number): SpacingIn {
  if (spacingIn <= 12) return 12;
  if (spacingIn <= 16) return 16;
  return 24;
}

/** Invert Table R507.6: smallest Southern pine size legal for span at spacing. */
export function smallestJoistForSpan(
  spanIn: number,
  spacingIn: number,
): { size: JoistSize; maxSpanIn: number } | { size: null; maxSpanIn: number; reason: string } {
  const col = nearestSpacing(spacingIn);
  if (spacingIn > 24) {
    return {
      size: null,
      maxSpanIn: 0,
      reason: "Table R507.6 has no column beyond 24 in o.c. Enter size; do not extrapolate.",
    };
  }
  for (const size of JOIST_SIZES) {
    const max = JOIST_SPAN_R507_6[size][col];
    if (spanIn <= max + 1e-6) return { size, maxSpanIn: max };
  }
  return {
    size: null,
    maxSpanIn: JOIST_SPAN_R507_6["2x12"][col],
    reason: `Span ${spanIn.toFixed(1)} in exceeds Table R507.6 2x12 at ${col} in o.c. (${JOIST_SPAN_R507_6["2x12"][col]} in).`,
  };
}

/**
 * Max joist cantilever for a back span.
 * Uses the next-lower listed back-span column when the value is between columns
 * (no interpolation invented). NP stays NP.
 */
export function maxJoistCantilever(size: JoistSize, backSpanIn: number): number | null {
  const backFt = backSpanIn / 12;
  let col = -1;
  for (let i = 0; i < CANTILEVER_BACKSPANS_FT.length; i++) {
    if (CANTILEVER_BACKSPANS_FT[i] <= backFt + 1e-9) col = i;
  }
  if (col < 0) return JOIST_CANTILEVER_R507_6[size][0];
  return JOIST_CANTILEVER_R507_6[size][col];
}

/**
 * Table R507.7 wood joist spacing (in o.c.).
 * 1-1/4 in perp: 12 single / 16 multiple
 * 1-1/4 diagonal: 8 / 12
 * 2 in perp: 24 / 24
 * 2 in diagonal: 18 / 24
 * Composite is not in the table — typed max only.
 */
export function woodDeckingMaxSpacingIn(
  category: DeckingCategory,
  diagonal: boolean,
  multipleSpan: boolean,
): number | null {
  if (category === "composite-other") return null;
  if (category === "wood-1.25") {
    if (diagonal) return multipleSpan ? 12 : 8;
    return multipleSpan ? 16 : 12;
  }
  if (diagonal) return multipleSpan ? 24 : 18;
  return 24;
}

export function effectiveJoistSpacingIn(args: {
  typedMaxIn: number;
  category: DeckingCategory;
  diagonal: boolean;
  multipleSpan: boolean;
}): { spacingIn: number; usedWoodTable: boolean; woodTableIn: number | null } {
  const wood = woodDeckingMaxSpacingIn(args.category, args.diagonal, args.multipleSpan);
  if (wood == null) {
    return { spacingIn: args.typedMaxIn, usedWoodTable: false, woodTableIn: null };
  }
  return {
    spacingIn: Math.min(args.typedMaxIn, wood),
    usedWoodTable: wood < args.typedMaxIn - 1e-9,
    woodTableIn: wood,
  };
}

/** Table R507.4 Southern pine 40 live. Post height underside of beam to top of footing. */
export const POST_TRIB_SF = [20, 40, 60, 80, 100, 120, 140, 160] as const;

export const POST_HEIGHT_4X4_R507_4: Record<number, number> = {
  20: ftIn(14, 0),
  40: ftIn(13, 8),
  60: ftIn(11, 0),
  80: ftIn(9, 5),
  100: ftIn(8, 4),
  120: ftIn(7, 5),
  140: ftIn(6, 9),
  160: ftIn(6, 2),
};

export function maxPostHeightIn(
  nominal: string,
  tributarySf: number,
): { heightIn: number | null; note: string } {
  if (nominal === "6x6" || nominal === "8x8") {
    if (tributarySf > 160) {
      return {
        heightIn: null,
        note: "Table R507.4 lists tributary area through 160 sf. Do not extrapolate.",
      };
    }
    return { heightIn: ftIn(14, 0), note: "Table R507.4 Southern pine 40 live: 6x6 and 8x8, 20–160 sf = 14-0." };
  }
  if (nominal === "4x6") {
    return {
      heightIn: null,
      note: "Table R507.4 4x6 cells are not in the v1 verified set. Use the table; do not invent intermediates.",
    };
  }
  if (nominal !== "4x4") {
    return { heightIn: null, note: `Table R507.4 has no verified v1 row for ${nominal}.` };
  }
  if (tributarySf > 160) {
    return { heightIn: null, note: "Table R507.4 lists tributary area through 160 sf. Do not extrapolate." };
  }
  let col: (typeof POST_TRIB_SF)[number] = POST_TRIB_SF[0];
  for (const t of POST_TRIB_SF) {
    if (tributarySf <= t) {
      col = t;
      break;
    }
    col = t;
  }
  return {
    heightIn: POST_HEIGHT_4X4_R507_4[col],
    note: `Table R507.4 Southern pine 40 live: 4x4 at ${col} sf tributary.`,
  };
}

/**
 * Table R507.5(1) Southern pine 40 live.
 * Southern pine is a row group. Columns are joist-span & joist-cantilever pairs.
 * Interpolation only for zero joist cantilever; no extrapolation.
 * 2021 Table R507.5(5) does not exist in 2024.
 * No numeric cells are in the v1 verified set.
 */
export function smallestBeamForSpan(_args: {
  joistSpanIn: number;
  joistCantileverIn: number;
  beamSpanIn: number;
}): {
  plyCount: number | null;
  nominalSize: string | null;
  verified: false;
  reason: string;
} {
  return {
    plyCount: null,
    nominalSize: null,
    verified: false,
    reason:
      "Table R507.5(1) Southern pine 40 psf live: this joist-span / joist-cantilever cell is not in the v1 verified set. Enter beam size. Interpolation is only for zero joist cantilever; do not extrapolate. 2021 Table R507.5(5) does not exist in 2024.",
  };
}

/** Beam cantilever ≤ actual beam span / 4 (R507.5.1). */
export function maxBeamCantileverIn(actualBeamSpanIn: number): number {
  return actualBeamSpanIn / 4;
}

/**
 * Table R507.9.1.3(1) 40 live, o.c. inches.
 * Columns: 1/2 in lag w/ 1/2 in max sheathing / 1/2 in bolt w/ 1/2 in sheathing / 1/2 in bolt w/ 1 in sheathing.
 * Interpolation OK; no extrapolation. No structural-screw column.
 */
export const LEDGER_JOIST_SPANS_FT = [6, 8, 10, 12, 14, 16, 18] as const;

export const LEDGER_OC_R507_9_1_3: Record<
  FastenerKind,
  Record<(typeof LEDGER_JOIST_SPANS_FT)[number], number>
> = {
  "lag-1/2-sheathing-1/2": { 6: 30, 8: 23, 10: 18, 12: 15, 14: 13, 16: 11, 18: 10 },
  "bolt-1/2-sheathing-1/2": { 6: 36, 8: 36, 10: 34, 12: 29, 14: 24, 16: 21, 18: 19 },
  "bolt-1/2-sheathing-1": { 6: 36, 8: 36, 10: 29, 12: 24, 14: 21, 16: 18, 18: 16 },
};

export function ledgerFastenerOcIn(
  kind: FastenerKind,
  joistSpanIn: number,
): { ocIn: number | null; note: string } {
  const spanFt = joistSpanIn / 12;
  const spans = LEDGER_JOIST_SPANS_FT;
  if (spanFt < spans[0] || spanFt > spans[spans.length - 1]) {
    return {
      ocIn: null,
      note: "Table R507.9.1.3(1) lists joist spans 6–18 ft. Do not extrapolate.",
    };
  }
  for (let i = 0; i < spans.length; i++) {
    if (Math.abs(spanFt - spans[i]) < 1e-9) {
      return { ocIn: LEDGER_OC_R507_9_1_3[kind][spans[i]], note: "Table R507.9.1.3(1) 40 live." };
    }
    if (i < spans.length - 1 && spanFt > spans[i] && spanFt < spans[i + 1]) {
      const y = interpolate(
        spanFt,
        spans[i],
        LEDGER_OC_R507_9_1_3[kind][spans[i]],
        spans[i + 1],
        LEDGER_OC_R507_9_1_3[kind][spans[i + 1]],
      );
      return { ocIn: y, note: "Table R507.9.1.3(1) 40 live, interpolated." };
    }
  }
  return { ocIn: LEDGER_OC_R507_9_1_3[kind][18], note: "Table R507.9.1.3(1) 40 live." };
}

/** Table R507.9.1.3(2) placement, inches. */
export const FASTENER_PLACEMENT = {
  ledger: { top: 2, bottom: 0.75, ends: 2, row: 1 + 5 / 8 },
  band: { top: 0.75, bottom: 2, ends: 2, row: 1 + 5 / 8 },
} as const;

export const JOIST_BEARING_ON_WOOD_METAL_IN = 1.5;

export const GUARD_HEIGHT_IN = 36;
export const GUARD_TRIGGER_HEIGHT_IN = 30;
export const GUARD_TRIGGER_HORIZONTAL_IN = 36;

export const STAIR_CLEAR_WIDTH_IN = 36;
export const STAIR_MAX_RISER_IN = 7.75;
export const STAIR_RISER_VARIATION_IN = 0.375;

export const LEDGER_MIN_NOMINAL = "2x8";
export const LATERAL_END_WINDOW_IN = 24;
