import type { Point } from "../model/types";
import { dist } from "../geom/vec";

/** Length in inches of a measure segment. Does not write scale. */
export function measureLengthIn(a: Point, b: Point, inchesPerUnit: number): number {
  return dist(a, b) * inchesPerUnit;
}

/** Cursor offset from a user-set origin, in inches. Photo +Y is down. */
export function offsetFromOriginIn(
  p: Point,
  origin: Point,
  inchesPerUnit: number,
): { xIn: number; yIn: number } {
  return {
    xIn: (p.x - origin.x) * inchesPerUnit,
    yIn: (p.y - origin.y) * inchesPerUnit,
  };
}

/** Extra whole pieces after a typed waste percent. 0 / empty → net. */
export function qtyWithWaste(netQty: number, wastePercent: number | null | undefined): number {
  if (wastePercent == null || wastePercent <= 0 || netQty <= 0) return netQty;
  return Math.ceil(netQty * (1 + wastePercent / 100) - 1e-12);
}

export function areaWithWaste(net: number, wastePercent: number | null | undefined): number {
  if (wastePercent == null || wastePercent <= 0) return net;
  return net * (1 + wastePercent / 100);
}

export function cutRowHighlighted(rowIds: string[], selectedIds: string[]): boolean {
  if (!rowIds.length || !selectedIds.length) return false;
  return rowIds.some((id) => selectedIds.includes(id));
}
