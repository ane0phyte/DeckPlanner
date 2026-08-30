/** All planner math is in inches. Display uses feet-inches. */

export function inchesToFeetInches(inches: number): { ft: number; inch: number } {
  const sign = inches < 0 ? -1 : 1;
  const abs = Math.abs(inches);
  const ft = Math.floor(abs / 12);
  const inch = abs - ft * 12;
  return { ft: sign * ft, inch: sign < 0 && ft === 0 ? -inch : inch };
}

export function formatInches(inches: number | null | undefined, digits = 2): string {
  if (inches == null || Number.isNaN(inches)) return "—";
  const sign = inches < 0 ? "-" : "";
  const abs = Math.abs(inches);
  const ft = Math.floor(abs / 12 + 1e-9);
  let inch = abs - ft * 12;
  if (inch < 0) inch = 0;
  const inchStr = Number(inch.toFixed(digits));
  if (inchStr === 12) return `${sign}${ft + 1}'-0"`;
  if (ft === 0) return `${sign}${inchStr}"`;
  return `${sign}${ft}'-${trimNum(inchStr)}"`;
}

export function formatSpanPair(ft: number, inch: number): string {
  return `${ft}-${inch}`;
}

function parseInchToken(token: string): number | null {
  const t = token.trim();
  const mixed = t.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

export function parseLengthToInches(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/inches?|in\.?/g, "").replace(/"/g, "").trim();
  if (!text) return null;

  const feetWord = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:feet|foot|ft|')$/);
  if (feetWord) return Number(feetWord[1]) * 12;

  const ftIn = text.match(
    /^(-?\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\s*[-–]?\s*(.+)$/,
  );
  if (ftIn) {
    const inches = parseInchToken(ftIn[2]);
    if (inches != null) return Number(ftIn[1]) * 12 + inches;
  }

  const dashed = text.match(/^(-?\d+)\s*[-–]\s*(.+)$/);
  if (dashed) {
    const inches = parseInchToken(dashed[2]);
    if (inches != null) return Number(dashed[1]) * 12 + inches;
  }

  return parseInchToken(text);
}

/**
 * Scale prompt is feet-inches (default 12-0). A bare "4" or "4'" is 4 feet (48 in).
 * Use 4" or 4 in for four inches.
 */
export function parseKnownLengthToInches(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?\s*(?:in(?:ches?)?|")$/.test(trimmed)) {
    return parseLengthToInches(trimmed);
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed) * 12;
  }
  return parseLengthToInches(trimmed);
}

export function ftIn(ft: number, inch = 0): number {
  return ft * 12 + inch;
}

export function interpolate(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

function trimNum(n: number): string {
  return String(n);
}

export const DRESSED: Record<string, { w: number; d: number }> = {
  "2x4": { w: 1.5, d: 3.5 },
  "2x6": { w: 1.5, d: 5.5 },
  "2x8": { w: 1.5, d: 7.25 },
  "2x10": { w: 1.5, d: 9.25 },
  "2x12": { w: 1.5, d: 11.25 },
  "4x4": { w: 3.5, d: 3.5 },
  "4x6": { w: 3.5, d: 5.5 },
  "6x6": { w: 5.5, d: 5.5 },
  "8x8": { w: 7.25, d: 7.25 },
};

export function dressedSize(nominal: string): { w: number; d: number } | null {
  return DRESSED[nominal] ?? null;
}
