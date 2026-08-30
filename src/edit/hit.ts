import type { PlannerObject, Point, Project } from "../model/types";
import { inchesPerUnit } from "../model/project";
import { dist } from "../geom/vec";
import { pointInPolygon, polygonArea } from "../geom/polygon";
import { boxArea, pointInOrientedBox } from "../geom/box";
import { getOrientedBox } from "./typedBox";

export interface HitCandidate {
  object: PlannerObject;
  area: number;
}

export function objectTypeLabel(type: PlannerObject["type"]): string {
  switch (type) {
    case "existingStairs":
    case "stairs":
      return "Stairs";
    case "houseWall":
      return "House wall";
    case "nodigZone":
      return "No-dig zone";
    case "nodigPoint":
      return "No-dig point";
    case "lateralDevice":
      return "Lateral device";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export function objectDisplayName(o: PlannerObject): string {
  const label = o.label?.trim();
  if (label && label !== o.type) return label;
  return objectTypeLabel(o.type);
}

export function hitPad(viewScale: number): number {
  return Math.max(24 / viewScale, 12);
}

export function pointInBox(p: Point, min: Point, max: Point): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

/** Axis-aligned bounds of a line, padded so thin segments stay clickable. */
export function lineBounds(a: Point, b: Point, pad: number): { min: Point; max: Point } {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const extraX = Math.max(pad, (pad * 2 - (maxX - minX)) / 2);
  const extraY = Math.max(pad, (pad * 2 - (maxY - minY)) / 2);
  return {
    min: { x: minX - extraX, y: minY - extraY },
    max: { x: maxX + extraX, y: maxY + extraY },
  };
}

export function objectVisible(o: PlannerObject, layers: Project["settings"]["layers"]): boolean {
  if (o.type === "nodigZone" || o.type === "nodigPoint") return layers.nodig;
  if (o.type === "guard") return layers.railings;
  if (o.type === "outline" || o.type === "houseWall" || o.type === "stairs" || o.type === "existingStairs") {
    return layers.photo || layers.framing;
  }
  return layers.framing;
}

export function objectHitArea(o: PlannerObject, _iPerU: number | null, pad: number): number {
  switch (o.type) {
    case "outline":
    case "nodigZone":
      return Math.max(Math.abs(polygonArea(o.points)), 1);
    case "stairs":
    case "existingStairs": {
      const box = getOrientedBox(o);
      return box ? boxArea(box) : 1;
    }
    case "post":
    case "nodigPoint":
    case "lateralDevice":
      return (pad * 2) ** 2;
    default:
      if (o.type === "board") {
        const box = getOrientedBox(o);
        if (box) return boxArea(box);
      }
      if ("a" in o && "b" in o) {
        return Math.max(dist(o.a, o.b) * pad * 2, 1);
      }
      return (pad * 2) ** 2;
  }
}

export function pointHitsObject(
  o: PlannerObject,
  p: Point,
  _iPerU: number | null,
  pad: number,
): boolean {
  switch (o.type) {
    case "outline":
    case "nodigZone":
      return pointInPolygon(p, o.points);
    case "stairs":
    case "existingStairs": {
      const box = getOrientedBox(o);
      return box ? pointInOrientedBox(p, box, pad) : false;
    }
    case "post":
    case "nodigPoint":
    case "lateralDevice":
      return dist(p, o.origin) <= pad;
    default:
      if (o.type === "board") {
        const ob = getOrientedBox(o);
        if (ob) return pointInOrientedBox(p, ob, pad);
      }
      if ("a" in o && "b" in o) {
        const box = lineBounds(o.a, o.b, pad);
        if (pointInBox(p, box.min, box.max)) return true;
        const abx = o.b.x - o.a.x;
        const aby = o.b.y - o.a.y;
        const l2 = abx * abx + aby * aby;
        const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - o.a.x) * abx + (p.y - o.a.y) * aby) / l2));
        return dist(p, { x: o.a.x + abx * t, y: o.a.y + aby * t }) <= pad;
      }
      return false;
  }
}

/** All objects whose bounds contain `p`, smallest area first. */
export function hitTestAll(project: Project, p: Point, viewScale: number): HitCandidate[] {
  const pad = hitPad(viewScale);
  const iPerU = inchesPerUnit(project);
  const hits: HitCandidate[] = [];
  for (const o of project.objects) {
    if (!objectVisible(o, project.settings.layers)) continue;
    if (pointHitsObject(o, p, iPerU, pad)) {
      hits.push({ object: o, area: objectHitArea(o, iPerU, pad) });
    }
  }
  hits.sort((a, b) => a.area - b.area || a.object.id.localeCompare(b.object.id));
  return hits;
}

export function hitTest(project: Project, p: Point, viewScale: number): PlannerObject | null {
  return hitTestAll(project, p, viewScale)[0]?.object ?? null;
}

export type SelectClick =
  | { kind: "handle" }
  | { kind: "object"; id: string }
  | { kind: "picker"; hits: HitCandidate[] }
  | { kind: "none" };

/**
 * Tight handle (on the knob) wins so vertices stay draggable.
 * Otherwise overlapping bounds open the picker instead of silently
 * taking a nearby vertex or the biggest polygon.
 */
export function resolveSelectClick(
  tightHandle: boolean,
  hits: HitCandidate[],
): SelectClick {
  if (tightHandle) return { kind: "handle" };
  if (hits.length > 1) return { kind: "picker", hits };
  if (hits.length === 1) return { kind: "object", id: hits[0].object.id };
  return { kind: "none" };
}
