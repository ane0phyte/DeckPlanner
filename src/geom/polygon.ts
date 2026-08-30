import type { Point } from "../model/types";
import { add, cross, dist, lerp, mul, norm, perp, sub } from "./vec";

export function polygonClosed(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (dist(first, last) < 1e-6) return points.slice(0, -1);
  return points;
}

export function polygonArea(points: Point[]): number {
  const pts = polygonClosed(points);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

export function polygonCentroid(points: Point[]): Point {
  const pts = polygonClosed(points);
  const a = polygonArea(pts);
  if (Math.abs(a) < 1e-9) {
    const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: s.x / pts.length, y: s.y / pts.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const f = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * f;
    cy += (pts[i].y + pts[j].y) * f;
  }
  const k = 1 / (6 * a);
  return { x: cx * k, y: cy * k };
}

export function pointInPolygon(p: Point, points: Point[]): boolean {
  const pts = polygonClosed(points);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const onSeg =
      Math.abs(cross(sub({ x: xj, y: yj }, { x: xi, y: yi }), sub(p, { x: xi, y: yi }))) < 1e-6 &&
      p.x >= Math.min(xi, xj) - 1e-6 &&
      p.x <= Math.max(xi, xj) + 1e-6 &&
      p.y >= Math.min(yi, yj) - 1e-6 &&
      p.y <= Math.max(yi, yj) + 1e-6;
    if (onSeg) return true;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonEdges(points: Point[]): { a: Point; b: Point }[] {
  const pts = polygonClosed(points);
  return pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length] }));
}

export function bbox(points: Point[]): { min: Point; max: Point } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export function inflate(points: Point[], amount: number): Point[] {
  return points.map((p) => ({ x: p.x + amount, y: p.y + amount }));
}

function lineSegIntersectT(a1: Point, a2: Point, b1: Point, b2: Point): number | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const qp = sub(b1, a1);
  const t = (qp.x * s.y - qp.y * s.x) / den;
  const u = (qp.x * r.y - qp.y * r.x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return Math.max(0, Math.min(1, t));
}

/**
 * Clip a segment to a convex or concave polygon.
 * Returns every inside run separately — does not bridge voids / water / notches.
 */
export function clipLineToPolygonSegments(a: Point, b: Point, poly: Point[]): { a: Point; b: Point }[] {
  const pts = polygonClosed(poly);
  if (pts.length < 3) return [];
  const ts: number[] = [];
  const addT = (t: number) => {
    if (ts.every((x) => Math.abs(x - t) > 1e-9)) ts.push(t);
  };
  if (pointInPolygon(a, pts)) addT(0);
  if (pointInPolygon(b, pts)) addT(1);
  for (const e of polygonEdges(pts)) {
    const t = lineSegIntersectT(a, b, e.a, e.b);
    if (t != null) addT(t);
  }
  ts.sort((x, y) => x - y);
  const segs: { a: Point; b: Point }[] = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 < 1e-8) continue;
    const mid = lerp(a, b, (t0 + t1) / 2);
    if (!pointInPolygon(mid, pts)) continue;
    segs.push({ a: lerp(a, b, t0), b: lerp(a, b, t1) });
  }
  return segs;
}

/** Longest inside run, or null. Prefer clipLineToPolygonSegments for concave outlines. */
export function clipLineToPolygon(a: Point, b: Point, poly: Point[]): { a: Point; b: Point } | null {
  const segs = clipLineToPolygonSegments(a, b, poly);
  if (!segs.length) return null;
  return segs.reduce((best, s) => (dist(s.a, s.b) > dist(best.a, best.b) ? s : best));
}

export function extendSegment(a: Point, b: Point, extra: number): { a: Point; b: Point } {
  const d = sub(b, a);
  const n = norm(d);
  return { a: add(a, mul(n, -extra)), b: add(b, mul(n, extra)) };
}

export function offsetLine(a: Point, b: Point, distAlongPerp: number): { a: Point; b: Point } {
  const n = mul(norm(perp(sub(b, a))), distAlongPerp);
  return { a: add(a, n), b: add(b, n) };
}

export function signedSide(p: Point, a: Point, b: Point): number {
  return cross(sub(b, a), sub(p, a));
}

export function inwardNormal(a: Point, b: Point, poly: Point[]): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const n = norm(perp(sub(b, a)));
  const test = add(mid, mul(n, 4));
  if (pointInPolygon(test, poly)) return n;
  return mul(n, -1);
}

export function circleHitsPolygon(c: Point, r: number, poly: Point[]): boolean {
  if (pointInPolygon(c, poly)) return true;
  for (const e of polygonEdges(poly)) {
    const ab = sub(e.b, e.a);
    const t = Math.max(0, Math.min(1, (sub(c, e.a).x * ab.x + sub(c, e.a).y * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    const p = { x: e.a.x + ab.x * t, y: e.a.y + ab.y * t };
    if (dist(c, p) <= r) return true;
  }
  return false;
}

export function perimeterLength(points: Point[]): number {
  return polygonEdges(points).reduce((s, e) => s + dist(e.a, e.b), 0);
}
