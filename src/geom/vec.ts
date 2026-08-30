import type { Point } from "../model/types";

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mul(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function len(a: Point): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Point, b: Point): number {
  return len(sub(b, a));
}

export function norm(a: Point): Point {
  const l = len(a);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

export function perp(a: Point): Point {
  return { x: -a.y, y: a.x };
}

export function fromAngleDeg(deg: number): Point {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

export function angleDeg(a: Point): number {
  return (Math.atan2(a.y, a.x) * 180) / Math.PI;
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpoint(a: Point, b: Point): Point {
  return lerp(a, b, 0.5);
}

export function projectT(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return 0;
  return dot(sub(p, a), ab) / l2;
}

export function closestOnSeg(p: Point, a: Point, b: Point): Point {
  const t = Math.max(0, Math.min(1, projectT(p, a, b)));
  return lerp(a, b, t);
}

export function distToSeg(p: Point, a: Point, b: Point): number {
  return dist(p, closestOnSeg(p, a, b));
}

export function snapPoint(p: Point, incrementIn: number, inchesPerUnit: number): Point {
  if (incrementIn <= 0 || inchesPerUnit <= 0) return p;
  const step = incrementIn / inchesPerUnit;
  return {
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step,
  };
}

export function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}
