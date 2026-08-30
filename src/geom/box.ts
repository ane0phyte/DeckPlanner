import type { Point } from "../model/types";

export interface OrientedBox {
  origin: Point;
  angleDeg: number;
  length: number;
  width: number;
}

export function boxFromCorners(a: Point, b: Point): OrientedBox | null {
  const length = Math.abs(b.x - a.x);
  const width = Math.abs(b.y - a.y);
  if (length < 4 || width < 4) return null;
  return {
    origin: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    angleDeg: 0,
    length,
    width,
  };
}

export function boxLocal(p: Point, box: OrientedBox): Point {
  const rad = (box.angleDeg * Math.PI) / 180;
  const dx = p.x - box.origin.x;
  const dy = p.y - box.origin.y;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

export function boxWorld(local: Point, box: OrientedBox): Point {
  const rad = (box.angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: box.origin.x + local.x * c - local.y * s,
    y: box.origin.y + local.x * s + local.y * c,
  };
}

/** Corners: 0 +L+W, 1 -L+W, 2 -L-W, 3 +L-W in local. */
export function boxCorners(box: OrientedBox): Point[] {
  const hx = box.length / 2;
  const hy = box.width / 2;
  return [
    boxWorld({ x: hx, y: hy }, box),
    boxWorld({ x: -hx, y: hy }, box),
    boxWorld({ x: -hx, y: -hy }, box),
    boxWorld({ x: hx, y: -hy }, box),
  ];
}

export function rotateHandlePoint(box: OrientedBox): Point {
  return boxWorld({ x: 0, y: -(box.width / 2) - Math.max(18, box.width * 0.15) }, box);
}

export function pointInOrientedBox(p: Point, box: OrientedBox, pad = 0): boolean {
  const loc = boxLocal(p, box);
  return Math.abs(loc.x) <= box.length / 2 + pad && Math.abs(loc.y) <= box.width / 2 + pad;
}

export function boxArea(box: OrientedBox): number {
  return Math.max(box.length * box.width, 1);
}

export function translateBox(box: OrientedBox, delta: Point): OrientedBox {
  return {
    ...box,
    origin: { x: box.origin.x + delta.x, y: box.origin.y + delta.y },
  };
}

export function rotateBoxToward(box: OrientedBox, to: Point): OrientedBox {
  const a = (Math.atan2(to.y - box.origin.y, to.x - box.origin.x) * 180) / Math.PI;
  return { ...box, angleDeg: a + 90 };
}

/** Keep the opposite corner fixed; rebuild the box in the current orientation. */
export function resizeBoxCorner(box: OrientedBox, cornerIndex: number, to: Point): OrientedBox {
  const opposite = (cornerIndex + 2) % 4;
  const fixed = boxCorners(box)[opposite];
  const a = boxLocal(fixed, box);
  const b = boxLocal(to, box);
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const length = Math.max(4, maxX - minX);
  const width = Math.max(4, maxY - minY);
  const mid = boxWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, box);
  return { origin: mid, angleDeg: box.angleDeg, length, width };
}

export function centerline(box: OrientedBox): { a: Point; b: Point } {
  return {
    a: boxWorld({ x: -box.length / 2, y: 0 }, box),
    b: boxWorld({ x: box.length / 2, y: 0 }, box),
  };
}
