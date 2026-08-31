import type { Point } from "../model/types";
import { dist, lerp } from "../geom/vec";
import {
  JOIST_SPAN_R507_6,
  maxJoistCantilever,
  nearestSpacing,
  type JoistSize,
} from "../irc/tables";

function segIntersectT(a1: Point, a2: Point, b1: Point, b2: Point): number | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return Math.max(0, Math.min(1, t));
}

function distToSeg(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}

/** Support parameters t along the joist. Ledger and drop beams only — rim is not a support. */
export function joistSupportTs(
  joist: { a: Point; b: Point },
  ledger: { a: Point; b: Point },
  beams: { a: Point; b: Point }[],
  pad: number,
): number[] {
  const ts: number[] = [];
  const add = (t: number) => {
    if (ts.every((x) => Math.abs(x - t) > 1e-4)) ts.push(t);
  };
  const tLed = segIntersectT(joist.a, joist.b, ledger.a, ledger.b);
  if (tLed != null) add(tLed);
  if (distToSeg(joist.a, ledger.a, ledger.b) <= pad) add(0);
  if (distToSeg(joist.b, ledger.a, ledger.b) <= pad) add(1);
  for (const beam of beams) {
    const t = segIntersectT(joist.a, joist.b, beam.a, beam.b);
    if (t != null) add(t);
    if (distToSeg(joist.a, beam.a, beam.b) <= pad) add(0);
    if (distToSeg(joist.b, beam.a, beam.b) <= pad) add(1);
  }
  ts.sort((a, b) => a - b);
  return ts;
}

/** Collapse supports that are only a few inches apart (crossing beams, ledger+beam). */
export function mergeSupportTs(ts: number[], lenIn: number, minBayIn = 3): number[] {
  if (ts.length < 2) return ts;
  const out: number[] = [ts[0]];
  for (let i = 1; i < ts.length; i++) {
    if ((ts[i] - out[out.length - 1]) * lenIn < minBayIn) {
      out[out.length - 1] = (out[out.length - 1] + ts[i]) / 2;
    } else {
      out.push(ts[i]);
    }
  }
  return out;
}

export function joistBaySpansIn(
  joist: { a: Point; b: Point },
  ledger: { a: Point; b: Point },
  beams: { a: Point; b: Point }[],
  iPerU: number,
): { maxBayIn: number; cantileverIn: number; supportCount: number; backSpanIn: number } {
  const pad = 4 / iPerU;
  const raw = joistSupportTs(joist, ledger, beams, pad);
  const lenIn = dist(joist.a, joist.b) * iPerU;
  const ts = mergeSupportTs(raw, lenIn, 3);
  if (ts.length === 0) {
    return { maxBayIn: lenIn, cantileverIn: lenIn, supportCount: 0, backSpanIn: 0 };
  }
  /** Ledger only: far end is not a drop beam. If length fits Table R507.6, treat as one span. */
  if (ts.length === 1) {
    return { maxBayIn: lenIn, cantileverIn: 0, supportCount: 1, backSpanIn: lenIn };
  }
  let maxBayIn = 0;
  for (let i = 1; i < ts.length; i++) {
    maxBayIn = Math.max(maxBayIn, (ts[i] - ts[i - 1]) * lenIn);
  }
  const last = ts[ts.length - 1];
  const first = ts[0];
  const cantStart = first * lenIn;
  const cantEnd = (1 - last) * lenIn;
  const cantileverIn = Math.max(cantStart, cantEnd);
  const backSpanIn =
    cantEnd >= cantStart ? (last - ts[ts.length - 2]) * lenIn : (ts[1] - first) * lenIn;
  return { maxBayIn, cantileverIn, supportCount: ts.length, backSpanIn };
}

export function splitSegmentAtLines(
  a: Point,
  b: Point,
  lines: { a: Point; b: Point }[],
): { a: Point; b: Point }[] {
  const ts = [0, 1];
  for (const line of lines) {
    const t = segIntersectT(a, b, line.a, line.b);
    if (t != null && t > 1e-4 && t < 1 - 1e-4) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: { a: Point; b: Point }[] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-4) continue;
    out.push({ a: lerp(a, b, ts[i]), b: lerp(a, b, ts[i + 1]) });
  }
  return out.length ? out : [{ a, b }];
}

/** True when a joist bay or cantilever violates Table R507.6 for this size/spacing. */
export function joistLayoutViolatesR5076(
  joist: { a: Point; b: Point },
  ledger: { a: Point; b: Point },
  beams: { a: Point; b: Point }[],
  size: JoistSize,
  spacingIn: number,
  iPerU: number,
): boolean {
  const bays = joistBaySpansIn(joist, ledger, beams, iPerU);
  const col = nearestSpacing(spacingIn);
  const maxSpan = JOIST_SPAN_R507_6[size][col];
  if (bays.maxBayIn > maxSpan + 1e-6) return true;
  const back = bays.backSpanIn > 6 ? bays.backSpanIn : bays.maxBayIn;
  const maxCant = maxJoistCantilever(size, back);
  if (maxCant == null) return bays.cantileverIn > 1;
  return bays.cantileverIn > maxCant + 1e-6;
}

/**
 * Inches from the last support to the next drop-beam along a joist, or null if the
 * remaining cantilever is already legal. Prefers ~10 ft when that keeps R507.6.
 */
export function nextSupportOffsetIn(
  size: JoistSize,
  spacingIn: number,
  remainingIn: number,
  lastBayIn: number,
  targetBayIn: number,
): number | null {
  if (remainingIn <= 1) return null;
  const col = nearestSpacing(spacingIn);
  const maxSpan = JOIST_SPAN_R507_6[size][col];
  const cantIfStop = maxJoistCantilever(size, lastBayIn);
  if (cantIfStop != null && remainingIn <= cantIfStop + 1e-6) return null;

  const ok = (d: number): boolean => {
    if (d < 6 || d > maxSpan + 1e-6) return false;
    const leftover = remainingIn - d;
    if (leftover < -1e-6) return false;
    if (leftover <= 0.75) return true;
    const mc = maxJoistCantilever(size, d);
    return mc != null && leftover <= mc + 1e-6;
  };

  const preferred = Math.min(targetBayIn, remainingIn, maxSpan);
  if (ok(preferred)) return preferred;

  for (let d = Math.min(remainingIn, maxSpan); d >= 6; d -= 1) {
    if (ok(d)) return d;
  }
  if (remainingIn <= maxSpan + 1e-6) return remainingIn;
  return maxSpan;
}
